export default function(params) {
  return `
  #version 100
  precision highp float;

  uniform sampler2D u_lightbuffer;  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];

  // Read this buffer to determine the lights influencing a cluster
  uniform sampler2D u_clusterbuffer;
  
  uniform mat4 u_viewMatrix;
  uniform mat4 u_inverseViewMatrix;
  uniform float u_screenWidth;
  uniform float u_screenHeight;
  uniform float camNear;
  uniform float u_zStride;

  uniform int u_gammaCorrection;
  uniform int u_shaderMode;

  varying vec2 f_uv;

  const int numXSlices = int(${params.numXSlices});
  const int numYSlices = int(${params.numYSlices});
  const int numZSlices = int(${params.numZSlices});
  const int numLights = int(${params.numLights});
  const int totalClusters = numXSlices*numYSlices*numZSlices;
  const int maxLightsPerCluster = int(${params.maxLightsPerCluster});
  const int numTexelsInColumn = int(ceil(float(${params.maxLightsPerCluster}+1) * 0.25)); 
  
  const vec3 specColor = vec3(0.1, 0.1, 0.1);
  const float shininess = 700.0;
  const float screenGamma = 2.2; // Assume the monitor is calibrated to the sRGB color space

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  float ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture2D(texture, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture2D(u_lightbuffer, vec2(u, 0.0));
    vec4 v2 = texture2D(u_lightbuffer, vec2(u, 0.5));
    light.position = v1.xyz;

    // LOOK: This extracts the 4th float (radius) of the (index)th light in the buffer
    // Note that this is just an example implementation to extract one float.
    // There are more efficient ways if you need adjacent values
    light.radius = ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);

    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  vec3 calcCompressedNormal_z(vec2 compressedNormal)
  {
    //we know that the normal has a magnitude of 1, therefore if we know x and y we can caluculate z
    compressedNormal -= 0.5;
    compressedNormal *= 2.0;

    float newZ = sqrt(1.0 - (compressedNormal.x*compressedNormal.x) - (compressedNormal.y*compressedNormal.y));

    vec3 result = vec3(compressedNormal.x, compressedNormal.y, newZ);
    return normalize(result);
  }

  void main() 
  {
    // extract data from g buffers and do lighting
    vec4 gb0 = texture2D(u_gbuffers[0], f_uv);
    vec4 gb1 = texture2D(u_gbuffers[1], f_uv);
    // vec4 gb2 = texture2D(u_gbuffers[2], f_uv);
    // vec4 gb3 = texture2D(u_gbuffers[3], f_uv);
    
    vec3 cameraPos = vec3(u_viewMatrix[3].rgb);

    vec3 f_position = gb0.rgb;
    vec3 albedo = gb1.rgb;

    //if using compressed normals
    vec2 compressedNormal = vec2(gb0.a, gb1.a);
    vec3 result = calcCompressedNormal_z(compressedNormal);
    vec3 normal = vec3(u_inverseViewMatrix*vec4(result, 0.0));

    // //if using uncompressed normals
    // vec3 normal = vec3(gb2.r, gb2.g, gb2.b);

    vec3 fragColor = vec3(0.0);

    vec3 fpos = vec3(u_viewMatrix*vec4(f_position, 1.0)); //f_position in viewspace
    fpos.z = -fpos.z;

    float xStride = float(u_screenWidth)/float(numXSlices);
    float yStride = float(u_screenHeight)/float(numYSlices);
    float zStride = float(u_zStride);

    int clusterX_index = int( floor(gl_FragCoord.x/ xStride) );
    int clusterY_index = int( floor(gl_FragCoord.y/ yStride) );
    int clusterZ_index = int( floor( (fpos.z-camNear) / zStride ) );

    int clusterID = clusterX_index + 
                    clusterY_index * numXSlices + 
                    clusterZ_index * numXSlices * numYSlices;

    float u = float(clusterID+1)/float(totalClusters+1);
    int clusterNumLights = int(texture2D(u_clusterbuffer, vec2(u,0)).r);

    for (int i = 0; i < numLights; ++i) 
    {
      if(i >= clusterNumLights)
      {
        break;
      }

      int lightIndex = int( ExtractFloat(u_clusterbuffer, totalClusters, numTexelsInColumn, clusterID, i+1) );

      Light light = UnpackLight(lightIndex);
      float lightDistance = distance(light.position, f_position);
      vec3 L = (light.position - f_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      if(u_shaderMode == 0)
      {
        //------------- Lambertian ------------------
        fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity);
        //-------------------------------------------
      }
      else if(u_shaderMode == 1)
      {
        //---------- Blinn-Phong Specular -----------
        float specular;
        if(lambertTerm > 0.0)
        {        
          vec3 viewDir = normalize(-f_position);
          vec3 halfDir = normalize(L + viewDir);
          float specAngle = max(dot(halfDir, normal), 0.0);
          specular = pow(specAngle, shininess);
        }

        fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity) + specular*specColor;
        //-------------------------------------------
      }
      else
      {
        //----------- Toon Shading ------------------
        float discrete_lambertTerm = lambertTerm*5.0;
        discrete_lambertTerm = floor(discrete_lambertTerm);
        discrete_lambertTerm = discrete_lambertTerm/5.0;

        float blackoutline = abs(dot( normal, normalize(cameraPos - f_position)));
        blackoutline = blackoutline * 10.0;
        blackoutline = floor(blackoutline)/10.0;
        if(blackoutline < 0.1) 
        {
          blackoutline = 0.1;
        }
        else 
        {
          blackoutline = 1.0;
        }

        // With Black outline -- looks terrible 
        // fragColor += blackoutline * albedo * discrete_lambertTerm * light.color * vec3(lightIntensity);
        // Without Black outline
        fragColor += albedo * discrete_lambertTerm * light.color * vec3(lightIntensity);
        //-------------------------------------------
      }
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    if(u_gammaCorrection == 1)
    {
      //----------- Gamma Correction --------------
      vec3 colorGammaCorrected = pow(fragColor, vec3(1.0/screenGamma));
      gl_FragColor = vec4(colorGammaCorrected, 1.0);
      //-------------------------------------------
    }
    else
    {
      //----------- No Gamma Correction -----------
      gl_FragColor = vec4(fragColor, 1.0);
      //-------------------------------------------
    }
  }
  `;
}