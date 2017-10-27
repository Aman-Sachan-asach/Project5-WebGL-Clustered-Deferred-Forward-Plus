import { makeRenderLoop, camera, cameraControls, gui, gl } from './init';
import ForwardRenderer from './renderers/forward';
import ClusteredForwardPlusRenderer from './renderers/clusteredForwardPlus';
import ClusteredDeferredRenderer from './renderers/clusteredDeferred';
import Scene from './scene';
import { NUM_LIGHTS } from './scene';
import { MAX_LIGHTS_PER_CLUSTER } from './scene';

const FORWARD = 'Forward';
const CLUSTERED_FORWARD_PLUS = 'Clustered Forward+';
const CLUSTERED_DEFFERED = 'Clustered Deferred';

const Lambertian = 'Lambertian';
const BlinnPhong = 'BlinnPhong';
const Toon = 'Toon';

var shadertype = 0;
var gammaSet = 0;

const params = {
  renderer: CLUSTERED_FORWARD_PLUS,
  numLights: NUM_LIGHTS,
  maxLightsPerCluster: MAX_LIGHTS_PER_CLUSTER,
  GammaCorrection: true,
  ShadingModel: Lambertian,
  _renderer: null,
};

setRenderer(params.renderer);

function setRenderer(renderer) {
  if(params.ShadingModel == 'Lambertian')
  {
    shadertype = 0;
  }
  else if(params.ShadingModel == 'BlinnPhong')
  {
    shadertype = 1;
  }
  else
  {
    shadertype = 2;
  }

  if(params.GammaCorrection == true)
  {
    gammaSet = 1;
  }
  else
  {
    gammaSet = 0;
  }

  switch(renderer) {
    case FORWARD:
      params._renderer = new ForwardRenderer();
      break;
    case CLUSTERED_FORWARD_PLUS:
      params._renderer = new ClusteredForwardPlusRenderer(15, 15, 15, camera, Math.floor(params.numLights), 
                                                                              Math.floor(params.maxLightsPerCluster), 
                                                                              gammaSet, 
                                                                              shadertype);
      break;
    case CLUSTERED_DEFFERED:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15, camera, Math.floor(params.numLights), 
                                                                           Math.floor(params.maxLightsPerCluster), 
                                                                           gammaSet,
                                                                           shadertype);
      break;
  }
}

gui.add(params, 'renderer', [FORWARD, CLUSTERED_FORWARD_PLUS, CLUSTERED_DEFFERED]).onChange(setRenderer);

// Will have to change the scene file to get dynamic changing of lights
// gui.add(params, 'numLights', 50, 10000).onChange(function(newVal) {
//   setRenderer(params.renderer);
// });
// gui.add(params, 'maxLightsPerCluster', 50, 7500).onChange(function(newVal) {
//   setRenderer(params.renderer);
// });

gui.add(params, 'GammaCorrection').onChange(function(newVal) {
  setRenderer(params.renderer);
});
gui.add(params, 'ShadingModel', [Lambertian, BlinnPhong, Toon]).onChange(function(newVal) {
  setRenderer(params.renderer);
});

const scene = new Scene();
scene.loadGLTF('models/sponza/sponza.gltf');

camera.position.set(-10, 8, 0);
cameraControls.target.set(0, 2, 0);
gl.enable(gl.DEPTH_TEST);

function render() {
  scene.update();
  params._renderer.render(camera, scene);
}

makeRenderLoop(render)();