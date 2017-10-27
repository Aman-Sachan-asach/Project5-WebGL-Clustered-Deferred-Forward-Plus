const MinimalGLTFLoader = require('../lib/minimal-gltf-loader');
import { gl } from './init';

// Edit if you want to change the light initial positions 
export const LIGHT_MIN = [-14, 0, -6];
export const LIGHT_MAX = [14, 20, 6];
export const LIGHT_RADIUS = 5.0;
export const LIGHT_DT = -0.03;

// This controls the number of lights
export var NUM_LIGHTS = 300; //2050 lights at 60 FPS
export var MAX_LIGHTS_PER_CLUSTER =  100;

class Scene {
  constructor() {
    this.lights = [];
    this.models = [];

    for (let i = 0; i < NUM_LIGHTS; ++i) {
      this.lights.push({
        position: new Float32Array([
          Math.random() * (LIGHT_MAX[0] - LIGHT_MIN[0]) + LIGHT_MIN[0],
          Math.random() * (LIGHT_MAX[1] - LIGHT_MIN[1]) + LIGHT_MIN[1],
          Math.random() * (LIGHT_MAX[2] - LIGHT_MIN[2]) + LIGHT_MIN[2],
        ]),
        color: new Float32Array([
          0.5 + 0.5 * Math.random(),
          0.5 + 0.5 * Math.random(),
          0.5 + Math.random(),
        ]),
        radius: LIGHT_RADIUS,
      });
    }
  }

  loadGLTF(url) {
    var glTFLoader = new MinimalGLTFLoader.glTFLoader(gl);
    glTFLoader.loadGLTF(url, glTF => {
      var curScene = glTF.scenes[glTF.defaultScene];
      
      var webGLTextures = {};
    
      // temp var
      var i,len;
      var primitiveOrderID;
    
      var mesh;
      var primitive;
      var vertexBuffer;
      var indicesBuffer;
    
      // textures setting
      var textureID = 0;
      var textureInfo;
      var samplerInfo;
      var target, format, internalFormat, type;   // texture info
      var magFilter, minFilter, wrapS, wrapT;
      var image;
      var texture;
    
      // temp for sponza
      var colorTextureName = 'texture_color';
      var normalTextureName = 'texture_normal';
    
      for (var tid in glTF.json.textures) {
        textureInfo = glTF.json.textures[tid];
        target = textureInfo.target || gl.TEXTURE_2D;
        format = textureInfo.format || gl.RGBA;
        internalFormat = textureInfo.format || gl.RGBA;
        type = textureInfo.type || gl.UNSIGNED_BYTE;
    
        image = glTF.images[textureInfo.source];
    
        texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + textureID);
        gl.bindTexture(target, texture);
    
        switch(target) {
          case 3553: // gl.TEXTURE_2D
            gl.texImage2D(target, 0, internalFormat, format, type, image);
            break;
        }
    
        // !! Sampler
        // raw WebGL 1, no sampler object, set magfilter, wrapS, etc
        samplerInfo = glTF.json.samplers[textureInfo.sampler];
        minFilter = samplerInfo.minFilter || gl.NEAREST_MIPMAP_LINEAR;
        magFilter = samplerInfo.magFilter || gl.LINEAR;
        wrapS = samplerInfo.wrapS || gl.REPEAT;
        wrapT = samplerInfo.wrapT || gl.REPEAT;
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, magFilter);
        gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrapS);
        gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrapT);
        if (minFilter == gl.NEAREST_MIPMAP_NEAREST || 
            minFilter == gl.NEAREST_MIPMAP_LINEAR || 
            minFilter == gl.LINEAR_MIPMAP_NEAREST ||
            minFilter == gl.LINEAR_MIPMAP_LINEAR ) {
          gl.generateMipmap(target);
        }
    
    
        gl.bindTexture(target, null);
    
        webGLTextures[tid] = {
          texture: texture,
          target: target,
          id: textureID
        };
    
        textureID++;
      }

      // vertex attributes
      for (var mid in curScene.meshes) {
        mesh = curScene.meshes[mid];

        for (i = 0, len = mesh.primitives.length; i < len; ++i) {
          primitive = mesh.primitives[i];

          vertexBuffer = gl.createBuffer();
          indicesBuffer = gl.createBuffer();

          // initialize buffer
          var vertices = primitive.vertexBuffer;
          gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, null);

          var indices = primitive.indices;
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

          var posInfo = primitive.attributes[primitive.technique.parameters['position'].semantic];
          var norInfo = primitive.attributes[primitive.technique.parameters['normal'].semantic];
          var uvInfo = primitive.attributes[primitive.technique.parameters['texcoord_0'].semantic];

          this.models.push({
            gltf: primitive,

            idx: indicesBuffer,

            attributes: vertexBuffer,
            posInfo: {size: posInfo.size, type: posInfo.type, stride: posInfo.stride, offset: posInfo.offset},
            norInfo: {size: norInfo.size, type: norInfo.type, stride: norInfo.stride, offset: norInfo.offset},
            uvInfo: {size: uvInfo.size, type: uvInfo.type, stride: uvInfo.stride, offset: uvInfo.offset},

            // specific textures temp test
            colmap: webGLTextures[colorTextureName].texture, 
            normap: webGLTextures[normalTextureName].texture
          });
        }
      }

    });
  }

  update() {
    for (let i = 0; i < NUM_LIGHTS; i++) {
      // OPTIONAL TODO: Edit if you want to change how lights move
      this.lights[i].position[1] += LIGHT_DT;
      // wrap lights from bottom to top
      this.lights[i].position[1] = (this.lights[i].position[1] + LIGHT_MAX[1] - LIGHT_MIN[1]) % LIGHT_MAX[1] + LIGHT_MIN[1];
    }
  }

  draw(shaderProgram) {
    for (let i = 0; i < this.models.length; ++i) {
      const model = this.models[i];
      if (model.colmap) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, model.colmap);
        gl.uniform1i(shaderProgram.u_colmap, 0);
      }

      if (model.normap) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, model.normap);
        gl.uniform1i(shaderProgram.u_normap, 1);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, model.attributes);
      
      gl.enableVertexAttribArray(shaderProgram.a_position);
      gl.vertexAttribPointer(shaderProgram.a_position, model.posInfo.size, model.posInfo.type, false, model.posInfo.stride, model.posInfo.offset);
  
      gl.enableVertexAttribArray(shaderProgram.a_normal);
      gl.vertexAttribPointer(shaderProgram.a_normal, model.norInfo.size, model.norInfo.type, false, model.norInfo.stride, model.norInfo.offset);
  
      gl.enableVertexAttribArray(shaderProgram.a_uv);
      gl.vertexAttribPointer(shaderProgram.a_uv, model.uvInfo.size, model.uvInfo.type, false, model.uvInfo.stride, model.uvInfo.offset);
  
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.idx);

      gl.drawElements(model.gltf.mode, model.gltf.indices.length, model.gltf.indicesComponentType, 0);
    }
  }

}

export default Scene;