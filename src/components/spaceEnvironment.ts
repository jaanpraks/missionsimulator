import * as C from 'cesium';

export const magneticTilt = C.Matrix3.fromRotationY(C.Math.toRadians(10));

export function earthFixedSunDirection(time: C.JulianDate, direction: C.Cartesian3, rotation: C.Matrix3) {
  C.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, direction);
  C.Transforms.computeIcrfToCentralBodyFixedMatrix(time, rotation);
  C.Matrix3.multiplyByVector(rotation, direction, direction);
  C.Cartesian3.normalize(direction, direction);
}

const beltGlow = `
  vec2 p = (materialInput.st - 0.5) * vec2(16.0, 10.0);
  float r = length(p);
  // Dipole field lines satisfy r = L cos²(latitude).
  float shell = r * r * r / max(p.x * p.x, 0.001);
  float latitude = atan(abs(p.y), max(abs(p.x), 0.001));
  float outsideEarth = smoothstep(1.0, 1.15, r);
  float inner = exp(-pow(abs(shell - 1.85) / 0.50, 2.0)
                    -pow(latitude / 0.42, 2.0)) * outsideEarth;
  float outer = exp(-pow(abs(shell - 4.8) / 1.15, 2.0)
                    -pow(latitude / 0.49, 2.0)) * outsideEarth;
  outer *= 1.0 - smoothstep(7.0, 7.9, r);
  material.diffuse = mix(vec3(1.0, 0.62, 0.28), vec3(0.68, 0.44, 1.0),
                         outer / max(inner + outer, 0.001));
  material.alpha = 0.29 * inner + 0.23 * outer;
`;

const magnetosphereGlow = `
  vec2 p = (materialInput.st - 0.5) * vec2(46.0, 38.0) + vec2(-11.0, 0.0);
  // Rounded dayside at +10 Earth radii with a gradually flaring nightside.
  float boundary = 10.0 - p.y * p.y * (0.075 + 0.00015 * p.y * p.y);
  float distance = (p.x - boundary) / (1.0 + 0.13 * abs(p.y));
  float rim = exp(-pow(abs(distance) / 0.85, 2.0));
  float inside = 1.0 - smoothstep(-2.5, 0.0, distance);
  float tailFade = smoothstep(-32.0, -12.0, p.x);
  float outsideEarth = smoothstep(1.0, 2.5, length(p));
  float edgeFade = 1.0 - smoothstep(17.0, 19.0, abs(p.y));
  material.diffuse = vec3(0.32, 0.75, 1.0);
  material.alpha = (0.14 * rim + 0.032 * inside) * tailFade * outsideEarth * edgeFade;
`;

function crossedGlow(width: number, height: number, centerX: number, source: string, aroundX: boolean) {
  const radius = C.Ellipsoid.WGS84.maximumRadius;
  const geometry = new C.PlaneGeometry({ vertexFormat: C.VertexFormat.POSITION_NORMAL_AND_ST });
  const scale = C.Matrix4.fromScale(new C.Cartesian3(width * radius, height * radius, radius));
  const center = new C.Cartesian3(centerX * radius, 0, 0);
  const vertical = C.Matrix3.fromRotationX(C.Math.PI_OVER_TWO);
  const rotations = aroundX
    ? [C.Matrix3.IDENTITY, vertical]
    : [vertical, C.Matrix3.multiply(C.Matrix3.fromRotationZ(C.Math.PI_OVER_TWO), vertical, new C.Matrix3())];

  return new C.Primitive({
    geometryInstances: rotations.map(rotation => new C.GeometryInstance({
      geometry,
      modelMatrix: C.Matrix4.multiply(C.Matrix4.fromRotationTranslation(rotation, center), scale, new C.Matrix4())
    })),
    appearance: new C.MaterialAppearance({
      materialSupport: C.MaterialAppearance.MaterialSupport.TEXTURED,
      flat: true,
      material: new C.Material({
        fabric: {
          source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);
            ${source}
            return material;
          }`
        }
      })
    }),
    allowPicking: false,
    asynchronous: false
  });
}

export function addSpaceEnvironment(scene: C.Scene) {
  const layer = scene.primitives.add(new C.PrimitiveCollection());
  const belts = layer.add(crossedGlow(16, 10, 0, beltGlow, false));
  belts.modelMatrix = C.Matrix4.fromRotationTranslation(magneticTilt);
  const magnetosphere = layer.add(crossedGlow(46, 38, -11, magnetosphereGlow, true));

  const sunward = new C.Cartesian3();
  const across = new C.Cartesian3();
  const north = new C.Cartesian3();
  const rotation = new C.Matrix3();
  const removeUpdate = scene.preUpdate.addEventListener((_scene: C.Scene, time: C.JulianDate) => {
    earthFixedSunDirection(time, sunward, rotation);
    C.Cartesian3.cross(C.Cartesian3.UNIT_Z, sunward, across);
    C.Cartesian3.normalize(across, across);
    C.Cartesian3.cross(sunward, across, north);
    C.Matrix3.fromColumnMajorArray([
      sunward.x, sunward.y, sunward.z,
      across.x, across.y, across.z,
      north.x, north.y, north.z
    ], rotation);
    C.Matrix4.fromRotationTranslation(rotation, C.Cartesian3.ZERO, magnetosphere.modelMatrix);
  });
  return () => {
    if (scene.isDestroyed()) return;
    removeUpdate();
    scene.primitives.remove(layer);
  };
}
