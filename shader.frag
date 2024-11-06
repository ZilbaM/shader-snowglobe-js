precision highp float;

// ----------------------------------------
// 1. Uniforms and Constants
// ----------------------------------------

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_cameraRotation; // x: pitch, y: yaw
uniform float u_cameraZoom;

#define MAX_STEPS 100
#define MAX_DIST 20.0
#define SURFACE_DIST 0.001

// Light parameters
vec3 lightDir = normalize(vec3(0.0, 1.0, 0.0)); // Light from above
vec3 lightColor = vec3(1.0);
vec3 ambientLight = vec3(0.2); // Ambient light intensity

// ----------------------------------------
// 2. Helper Functions
// ----------------------------------------

// Hash function for noise generation
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// Perlin noise function
float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);

    f = f * f * (3.0 - 2.0 * f);

    float n = p.x + p.y * 57.0 + 113.0 * p.z;

    return mix(
        mix(
            mix(hash(n +   0.0), hash(n +   1.0), f.x),
            mix(hash(n +  57.0), hash(n +  58.0), f.x),
            f.y
        ),
        mix(
            mix(hash(n + 113.0), hash(n + 114.0), f.x),
            mix(hash(n + 170.0), hash(n + 171.0), f.x),
            f.y
        ),
        f.z
    );
}

// Signed distance functions (SDFs) for basic shapes
float sdSphere(vec3 p, float s) {
    return length(p) - s;
}

float sdCappedCylinder(vec3 p, vec2 h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - h;
    return min(max(d.x, d.y), 0.0) + length(max(d, vec2(0.0)));
}

// ----------------------------------------
// 3. Shape Functions
// ----------------------------------------

// SDF for the snowglobe sphere
float shapeBall(vec3 pos) {
    return sdSphere(pos, 0.6);
}

// SDF for the base (support) of the snowglobe
float shapeSupport(vec3 pos) {
    vec3 p = pos;
    p.y += 0.55;
    return sdCappedCylinder(p, vec2(0.55, 0.2)) - 0.03;
}

// SDF for the snow particles inside the globe
float shapeSnow(vec3 pos) {
    // Generate random positions for snow particles using noise
    float n = noise(pos * 10.0 + u_time * 0.5);

    // Create small spherical snow particles
    float snowParticle = sdSphere(pos + n * 0.1, 0.02);

    // Combine multiple layers of noise to create scattered particles
    float density = 0.0;
    for (int i = 0; i < 4; i++) {
        vec3 offset = vec3(float(i)) * 123.456;
        float ni = noise(pos * (5.0 + float(i) * 2.0) + u_time * (0.5 + float(i) * 0.2) + offset);
        density += smoothstep(0.0, 0.1, ni - 0.5);
    }

    // The density determines the presence of snow particles
    float snow = snowParticle + (1.0 - density) * 200.0;

    // Ensure snow particles are only inside the globe
    float globe = sdSphere(pos, 0.6);

    // Return the maximum of the snow and globe distances to confine snow inside
    return max(snow, globe);
}

// ----------------------------------------
// 4. Distance Function
// ----------------------------------------

// Combines all SDFs to determine the closest distance and material ID
vec2 map(vec3 p) {
    float dBall = shapeBall(p);
    float dSupport = shapeSupport(p);
    float dSnow = shapeSnow(p);

    float minDist = dBall;
    float materialID = 1.0; // 1: ball

    if (dSnow < minDist) {
        minDist = dSnow;
        materialID = 2.0; // 2: snow
    }

    if (dSupport < minDist) {
        minDist = dSupport;
        materialID = 3.0; // 3: support (base)
    }

    return vec2(minDist, materialID);
}

// ----------------------------------------
// 5. Normal Calculation
// ----------------------------------------

// Computes the normal vector at point p using numerical gradient
vec3 GetNormal(vec3 p) {
    float eps = 0.001;
    float dx = map(p + vec3(eps, 0.0, 0.0)).x - map(p - vec3(eps, 0.0, 0.0)).x;
    float dy = map(p + vec3(0.0, eps, 0.0)).x - map(p - vec3(0.0, eps, 0.0)).x;
    float dz = map(p + vec3(0.0, 0.0, eps)).x - map(p - vec3(0.0, 0.0, eps)).x;
    return normalize(vec3(dx, dy, dz));
}

// ----------------------------------------
// 6. Shading Functions
// ----------------------------------------

// Shades the snow particles
vec3 shadeSnow(vec3 pos, vec3 ray) {
    vec3 norm = GetNormal(pos);

    // Ambient light
    vec3 ambient = ambientLight * vec3(1.0); // White snow
    ambient *= 2.0; // Increase ambient intensity for snow

    // Diffuse shading
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor * vec3(1.0);

    return ambient + diffuse;
}

// Shades the base (support) of the snowglobe
vec3 shadeSupport(vec3 pos, vec3 ray) {
    vec3 norm = GetNormal(pos);

    // Ambient light
    vec3 ambient = ambientLight * vec3(0.8, 0.5, 0.3); // Base color

    // Diffuse shading
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor * vec3(0.8, 0.5, 0.3);

    // Specular shading
    vec3 viewDir = normalize(-ray);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec3 specular = spec * lightColor * 0.5;

    return ambient + diffuse + specular;
}

// Shades the snowglobe's glass sphere
vec3 shadeBall(vec3 pos, vec3 ray) {
    float ior = 1.0 / 1.5; // Index of refraction (air to glass)
    vec3 norm = GetNormal(pos);

    // Refraction
    vec3 refrRay = refract(ray, norm, ior);
    if (length(refrRay) == 0.0) {
        // Total internal reflection
        refrRay = reflect(ray, norm);
    }
    vec3 refrPos = pos + refrRay * 0.001;

    // Trace snow inside the globe
    float ts = 0.0;
    bool hitSnow = false;
    vec3 p;
    for (int i = 0; i < MAX_STEPS; i++) {
        p = refrPos + refrRay * ts;
        float d = shapeSnow(p);
        if (d < SURFACE_DIST) {
            hitSnow = true;
            break;
        }
        ts += d;
        if (ts > MAX_DIST) {
            break;
        }
    }

    vec3 col;
    if (hitSnow) {
        // Shade the snow
        col = shadeSnow(p, refrRay);
    } else {
        // Ambient light inside the globe
        col = ambientLight * vec3(0.5);
    }

    // Reflection (using background color)
    vec3 reflColor = vec3(0.2); // Dark gray

    // Fresnel effect
    float fresnel = pow(1.0 - max(dot(norm, -ray), 0.0), 3.0);
    col = mix(col, reflColor, fresnel);

    // Lighting on the globe surface
    // Ambient light
    vec3 ambient = ambientLight * vec3(0.9, 0.9, 0.95); // Slightly bluish glass color

    // Diffuse shading
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor * vec3(0.9, 0.9, 0.95);

    // Combine
    col += ambient + diffuse;

    return col;
}

// ----------------------------------------
// 7. Main Function
// ----------------------------------------

void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;

    // Camera setup
    float pitch = u_cameraRotation.x;
    float yaw = u_cameraRotation.y;

    // Camera position
    vec3 ro = vec3(
        u_cameraZoom * cos(pitch) * sin(yaw),
        u_cameraZoom * sin(pitch),
        u_cameraZoom * cos(pitch) * cos(yaw)
    );

    // Camera direction vectors
    vec3 forward = normalize(-ro); // Looking at the origin
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);

    // Construct ray direction
    vec3 rd = normalize(uv.x * right + uv.y * up + forward);

    // Ray marching
    float t = 0.0;
    int hitType = 0;
    bool hit = false;
    vec3 p;

    for (int i = 0; i < MAX_STEPS; i++) {
        p = ro + t * rd;
        vec2 res = map(p);
        float d = res.x;
        if (d < SURFACE_DIST) {
            hit = true;
            hitType = int(res.y);
            break;
        }
        t += d;
        if (t > MAX_DIST) {
            break;
        }
    }

    vec3 color;
    if (hit) {
        if (hitType == 1) {
            // Hit the ball
            color = shadeBall(p, rd);
        } else if (hitType == 2) {
            // Hit the snow
            color = shadeSnow(p, rd);
        } else if (hitType == 3) {
            // Hit the support (base)
            color = shadeSupport(p, rd);
        }
    } else {
        // Background color
        color = vec3(0.4, 0.4, 0.6); 
    }

    gl_FragColor = vec4(color, 1.0);
}
