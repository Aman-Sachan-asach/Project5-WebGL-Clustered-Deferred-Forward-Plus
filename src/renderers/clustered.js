// Super important reference: --> http://gamedevs.org/uploads/fast-extraction-viewing-frustum-planes-from-world-view-projection-matrix.pdf
// Making a Struct factory --> https://stackoverflow.com/questions/502366/structs-in-javascript
// Enums in javascript --> https://stijndewitt.com/2014/01/26/enums-in-javascript/

import { mat4, vec4, vec3 } from 'gl-matrix';
import TextureBuffer from './textureBuffer';
import AABB from '../AABB'

export default class ClusteredRenderer 
{
  constructor(xSlices, ySlices, zSlices, camera, MaxLightsPerCluster) 
  {
    // Create a texture to store cluster data. Each cluster stores the number of lights followed by the light indices
    this._clusterTexture = new TextureBuffer(xSlices * ySlices * zSlices, MaxLightsPerCluster + 1);
    this._xSlices = xSlices;
    this._ySlices = ySlices;
    this._zSlices = zSlices;
    this._MaxLightsPerCluster = MaxLightsPerCluster + 1;

    //find bounding x and y values of the camera frustum    
    this.vertical_FoV = camera.fov;
    this.tan_Vertical_FoV_by_2 = Math.tan(this.vertical_FoV * (Math.PI/180.0) * 0.5);
    this.zStride = (camera.far-camera.near)/this._zSlices;

    /*
    Layout of _clusterTexture

    ------------------cluster0-----------------cluster1---------------cluster2---------------(u)-
    component0 |count|lid0|lid1|lid2 || count|lid0|lid1|lid2 || count|lid0|lid1|lid2
    component1 |lid3 |lid4|lid5|lid6 || lid3 |lid4|lid5|lid6 || lid3 |lid4|lid5|lid6
    component2 |lid7 |lid8|lid9|lid10|| lid7 |lid8|lid9|lid10|| lid7 |lid8|lid9|lid10
    (v)

    To get the fourth light in the first cluster, you need the lid3 in the cluster0. 

    The texture is laid out as ceil((maxLightsPerCluster+1)/4.0f) by numClusters, 
    num Rows = ceil((maxLightsPerCluster+1)/4.0f); 
    num Columns = numClusters


    to find v: light_num + 1 (to account for the count) / 4 (cuz 4 values per pixel)
    to find light placement within pixel = (light_num + 1) % 4 
    */
  }
  
  clamp(value, lower, upper)
  {
    return Math.max(lower, Math.min(value, upper));
  }

  updateClusters(camera, viewMatrix, scene, numLights) 
  {
    //This function updates the cluster texture with the count and indices of the lights in each cluster

    //Reset things for clusters
    for (let z = 0; z < this._zSlices; ++z) 
    {
      for (let y = 0; y < this._ySlices; ++y) 
      {
        for (let x = 0; x < this._xSlices; ++x) 
        {
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          // Reset the light count to 0 for every cluster
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = 0;
        }
      }
    }

    //instead of using the farclip plane as the arbitrary plane to base all our calculations and division splitting off of
    var xStride, yStride;
    var xStartIndex, yStartIndex, zStartIndex;
    var xEndIndex, yEndIndex, zEndIndex;

    var h_lightFrustum, w_lightFrustum;
    var lightRadius;
    var clusterLightCount;

    for (let i=0; i<numLights; i++)
    {
      lightRadius = scene.lights[i].radius;
      var _lightPos = vec4.fromValues(scene.lights[i].position[0], 
                                      scene.lights[i].position[1], 
                                      scene.lights[i].position[2], 
                                      1.0);
      vec4.transformMat4(_lightPos, _lightPos, viewMatrix); //World to View

      var lightPos = vec3.fromValues(_lightPos[0], 
                                     _lightPos[1], 
                                     _lightPos[2] );
      lightPos[2] *= -1; //camera looks down negative z, make z axis positive to make calculations easier
      
      var lightAABB = new AABB();
      lightAABB.calcAABB_PointLight(lightPos, lightRadius);

      h_lightFrustum = Math.abs(this.tan_Vertical_FoV_by_2*lightPos[2]*2);
      w_lightFrustum = Math.abs(camera.aspect*h_lightFrustum);

      xStride = w_lightFrustum/this._xSlices;
      yStride = h_lightFrustum/this._ySlices;

      zStartIndex = Math.floor(lightAABB.min[2]/this.zStride); // Need to extend this by -1 and +1 to avoid edge cases where light 
                                                                   //technically could fall outside the bounds we make because the planes themeselves are tilted by some angle
                                                                   // the effect is exaggerated the steeper the angle the plane makes is
      zEndIndex = Math.floor(lightAABB.max[2]/this.zStride);

      yStartIndex = Math.floor((lightAABB.min[1] + h_lightFrustum*0.5)/yStride);
      yEndIndex = Math.floor((lightAABB.max[1] + h_lightFrustum*0.5)/yStride);

      xStartIndex = Math.floor((lightAABB.min[0] + w_lightFrustum*0.5)/xStride)-1;
      xEndIndex = Math.floor((lightAABB.max[0] + w_lightFrustum*0.5)/xStride)+1;

      //Culling
      if((zStartIndex < 0 && zEndIndex < 0) ||
         (zStartIndex >= this._zSlices && zEndIndex >= this._zSlices))
      {
        continue; //light wont fall into any cluster
      }

      if((yStartIndex < 0 && yEndIndex < 0) ||
         (yStartIndex >= this._ySlices && yEndIndex >= this._ySlices))
      {
        continue; //light wont fall into any cluster
      }

      if((xStartIndex < 0 && xEndIndex < 0) ||
         (xStartIndex >= this._xSlices && xEndIndex >= this._xSlices))
      {
        continue; //light wont fall into any cluster
      }

      zStartIndex = this.clamp(zStartIndex, 0, this._zSlices-1);
      zEndIndex = this.clamp(zEndIndex, 0, this._zSlices-1);

      yStartIndex = this.clamp(yStartIndex, 0, this._ySlices-1);
      yEndIndex = this.clamp(yEndIndex, 0, this._ySlices-1);

      xStartIndex = this.clamp(xStartIndex, 0, this._xSlices-1);
      xEndIndex = this.clamp(xEndIndex, 0, this._xSlices-1);

      for (let z = zStartIndex; z <= zEndIndex; ++z)
      {        
        for (let y = yStartIndex; y <= yEndIndex; ++y)
        {
          for (let x = xStartIndex; x <= xEndIndex; ++x) 
          {
            let clusterID = x + y * this._xSlices + z * this._xSlices * this._ySlices;
            // Update the light count for every cluster
            var lightCountIndex = this._clusterTexture.bufferIndex(clusterID, 0);
            clusterLightCount = this._clusterTexture.buffer[lightCountIndex];

            if((clusterLightCount+1) <= this._MaxLightsPerCluster)
            {
              this._clusterTexture.buffer[lightCountIndex] = clusterLightCount+1;

              let texel = Math.floor((clusterLightCount+1)/4);
              let texelIndex = this._clusterTexture.bufferIndex(clusterID, texel);
              let texelSubIndex = (clusterLightCount+1) - texel*4; //texel%4;

              // Update the light index for the particular cluster in the light buffer
              this._clusterTexture.buffer[texelIndex + texelSubIndex] = i;
            }
          }//x
        }//y
      }//z
    }//loop over lights

    this._clusterTexture.update();
  }
}