import {
    Color,
    Face3,
    FaceColors,
    Geometry,
    BufferGeometry,
    Mesh,
    MeshLambertMaterial,
    Vector2,
    Vector3,
    MeshNormalMaterial,
    Float32BufferAttribute,
    BufferAttribute,
} from "./node_modules/three/build/three.module.js"


function adj(data, pos,x,y,z) {
    return data.voxelAtCoordinates(pos.clone().add(new Vector3( x,  y, z)))>0?1:0
}

export class VoxelMesh {
    constructor(data, mesher, scaleFactor, app) {
        this.data = data
        const geometry = this.geometry = new BufferGeometry()
        this.scale = scaleFactor || new Vector3(10, 10, 10)

        const result = mesher.mesh(data.voxels, data.dims)
        this.meshed = result

        //create empty geometry
        const vertices = []
        const repeatUV = []
        const subrects = []

        //copy all verticies in from meshed data
        for (let i = 0; i < result.vertices.length; ++i) {
            let q = result.vertices[i]
            vertices.push(q[0],q[1],q[2])
        }

        const indices = []
        const normaluvs = []
        const frameCount = []
        const occlusion = []
        // if(result.faces.length > 0) console.log(result)
        /*
            generate faces from meshed data

            Note: that quad faces do not use shared vertices. There will always be faces*4 vertices, even
            if some of the faces could share vertices because all attributes are per vertex, and
            those values, such as normals, cannot be shared even if the vertex positions could be.

            each face is represented by two triangles using indexes and one set of uvs (4) for the whole
            face.
        */
        const atlasIndex = app.textureManager.getAtlasIndex()
        for (let i = 0; i < result.faces.length; ++i) {
            // console.log("face",i)
            let q = result.faces[i]
            if (q.length === 5) {
                const info = app.textureManager.lookupInfoForBlockType(q[4])
                const realUVs = app.textureManager.lookupUVsForBlockType(q[4])
                const a = q[0]
                const b = q[1]
                const c = q[2]
                const d = q[3]

                //make two triangles
                /*
                    d --- c
                    |     |
                    a --- b
                 */
                indices.push(a,b,d)
                indices.push(b,c,d)

                let repU = 1
                let repV = 1
                const {size,uvs, spans} = this.faceVertexUv(i)

                let ao_c = 1.0
                let ao_a = 1.0
                let ao_d = 1.0;
                let ao_b = 1.0;

                let uv_a = new Vector2(0,0)
                let uv_b = new Vector2(1,0)
                let uv_c = new Vector2(1,1)
                let uv_d = new Vector2(0,1)

                if(size.x > 0 && size.y > 0) {
                    // console.log("front or back", size, uvs, spans)

                    if(spans.x0 > spans.x1) {
                        //calculate AO for back face
                        repU = size.y
                        repV = size.x
                        const norm = new Vector3(0,0,-1)
                        const pos = new Vector3(result.vertices[a][0], result.vertices[a][1], result.vertices[a][2])

                        const grid = []
                        for(let q=-1; q<2; q++) {
                            for(let p=-1;p<2; p++) {
                                grid.push(adj(data,pos,p,q,norm.z))
                            }
                        }
                        ao_a = vertexAO(grid[3], grid[1], grid[0])/3.0;
                        ao_b = vertexAO(grid[1], grid[5], grid[2])/3.0;
                        ao_c = vertexAO(grid[5], grid[7], grid[8])/3.0;
                        ao_d = vertexAO(grid[3], grid[7], grid[6])/3.0;
                    } else {
                        //calculate AO for front face
                        repU = size.x
                        repV = size.y
                        const norm = new Vector3(0,0,1)
                        const pos = new Vector3(result.vertices[a][0], result.vertices[a][1], result.vertices[a][2]-1)
                        const grid = []
                        for(let q=-1; q<2; q++) {
                            for(let p=-1;p<2; p++) {
                                grid.push(adj(data,pos,p,q,norm.z))
                            }
                        }
                        ao_a = vertexAO(grid[3], grid[1], grid[0])/3.0;
                        ao_b = vertexAO(grid[1], grid[5], grid[2])/3.0;
                        ao_c = vertexAO(grid[5], grid[7], grid[8])/3.0;
                        ao_d = vertexAO(grid[3], grid[7], grid[6])/3.0;
                    }
                }

                occlusion.push(ao_a,ao_b,ao_c,ao_d)

                if(size.z > 0 && size.x > 0) {
                    // console.log("top or bottom", size)
                    if(spans.x0 > spans.x1) {
                        repU = size.z
                        repV = size.x
                    } else {
                        repU = size.x
                        repV = size.z
                    }
                }

                if(size.z > 0 && size.y > 0) {
                    // console.log("left or right", size, spans)
                    if(spans.y0 > spans.y1) {
                        repU = size.z
                        repV = size.y
                    } else {
                        repU = size.y
                        repV = size.z
                    }
                }
                for(let j=0; j<4; j++) {
                    repeatUV.push(repU, repV);
                }

                //set standard uvs for the whole quad
                normaluvs.push(uv_a.x,uv_a.y, uv_b.x,uv_b.y, uv_c.x, uv_c.y, uv_d.x,uv_d.y)

                const rect = {
                    x:realUVs[0][0],
                    y:1.0 - realUVs[0][1],
                    w:realUVs[1][0] - realUVs[0][0],
                    h:realUVs[2][1] - realUVs[1][1],
                }
                let fc = 1
                if(info.animated) {
                    fc = rect.w/rect.h
                    rect.w = rect.h
                }
                //flip the y axis properly
                rect.y = 1.0 - realUVs[0][1] - rect.h
                for(let j=0; j<4; j++) {
                    subrects.push(rect.x,rect.y,rect.w,rect.h)
                }

                for(let j=0; j<4; j++) {
                    frameCount.push(fc)
                }


            } else if (q.length === 4) {
                console.log("bad")
            }
        }
        geometry.setIndex(indices)
        geometry.addAttribute('position',new Float32BufferAttribute(vertices,3))
        geometry.addAttribute('uv', new Float32BufferAttribute(normaluvs,2))
        geometry.addAttribute('subrect',new Float32BufferAttribute(subrects,4))
        geometry.addAttribute('repeat', new Float32BufferAttribute(repeatUV,2))
        geometry.addAttribute('frameCount',new Float32BufferAttribute(frameCount,1))
        geometry.addAttribute('occlusion',new Float32BufferAttribute(occlusion,1))

        geometry.computeFaceNormals()
        geometry.uvsNeedUpdate = true
        geometry.verticesNeedUpdate = true
        geometry.elementsNeedUpdate = true
        geometry.normalsNeedUpdate = true

        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()

    }

    createSurfaceMesh(material) {
        const surfaceMesh = new Mesh(this.geometry, material)
        surfaceMesh.scale.copy(this.scale)
        this.surfaceMesh = surfaceMesh
        return surfaceMesh
    }

    faceVertexUv(i) {
        let height
        let width
        const vs = [
            this.meshed.vertices[i * 4 + 0],
            this.meshed.vertices[i * 4 + 1],
            this.meshed.vertices[i * 4 + 2],
            this.meshed.vertices[i * 4 + 3]
        ]
        const spans = {
            x0: vs[0][0] - vs[1][0],
            x1: vs[1][0] - vs[2][0],
            y0: vs[0][1] - vs[1][1],
            y1: vs[1][1] - vs[2][1],
            z0: vs[0][2] - vs[1][2],
            z1: vs[1][2] - vs[2][2]
        }
        const size = {
            x: Math.max(Math.abs(spans.x0), Math.abs(spans.x1)),
            y: Math.max(Math.abs(spans.y0), Math.abs(spans.y1)),
            z: Math.max(Math.abs(spans.z0), Math.abs(spans.z1))
        }

        if (size.x === 0) {
            if (spans.y0 > spans.y1) {
                width = size.y
                height = size.z
            } else {
                width = size.z
                height = size.y
            }
        }
        if (size.y === 0) {
            if (spans.x0 > spans.x1) {
                width = size.x
                height = size.z
            } else {
                width = size.z
                height = size.x
            }
        }
        if (size.z === 0) {
            if (spans.x0 > spans.x1) {
                width = size.x
                height = size.y
            } else {
                width = size.y
                height = size.x
            }
        }

        let uvs = []
        if ((size.z === 0 && spans.x0 < spans.x1) || (size.x === 0 && spans.y0 > spans.y1)) {
            uvs = [
                new Vector2(height, 0),
                new Vector2(0, 0),
                new Vector2(0, width),
                new Vector2(height, width)
            ]
        } else {
            uvs = [
                new Vector2(0, 0),
                new Vector2(0, height),
                new Vector2(width, height),
                new Vector2(width, 0)
            ]
        }
        return {size, uvs, spans}

    }
}


function vertexAO(side1, side2, corner) {
    if(side1 && side2) {
        return 0
    }
    return 3 - (side1 + side2 + corner)
}
