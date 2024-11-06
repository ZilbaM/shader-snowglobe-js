precision highp float;

// Uniforms and Constants

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_cameraRotation; 
uniform float u_cameraZoom;

#define MAX_STEPS 100
#define MAX_DIST 20.0
#define SURFACE_DIST 0.01

// Light 
vec3 lightDir = normalize(vec3(1, 1.0, 0.0)); 
vec3 lightColor = vec3(0.6);
vec3 ambientLight = vec3(0.2); // Reduced ambient light intensity

// Helper Functions

// Hash for noise generation
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// Perlin noise 3D 
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

// Signed distance functions 

float sdSphere(vec3 p, float s) {
    return length(p) - s;
}

float sdCappedCylinder(vec3 p, vec2 h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - h;
    return min(max(d.x, d.y), 0.0) + length(max(d, vec2(0.0)));
}

// Shape Functions

// Snowglobe sphere
float shapeBall(vec3 pos) {
    return sdSphere(pos, 0.6);
}

// Base (support) 
float shapeSupport(vec3 pos) {
    vec3 p = pos;
    p.y += 0.55;
    return sdCappedCylinder(p, vec2(0.55, 0.2)) - 0.03;
}

vec3 getBackgroundColor() {
    float t = u_time * 0.1;
    vec3 color = vec3(
        0.2 + 0.2 * sin(t),
        0.2 + 0.2 * sin(t + 2.0),
        0.2 + 0.2 * sin(t + 4.0)
    );
    return color;
}

// Snow particles inside the globe
float shapeSnow(vec3 pos) {
    // Random positions for snow particles
    float n = noise(pos * 10.0 + u_time * 0.5);

    float snowParticle = sdSphere(pos + n * 0.1, 0.05);

    // Combine multiple layers of noise
    float density = 0.0;
    for (int i = 0; i < 3; i++) {
        vec3 offset = vec3(float(i)) * 123.456;
        float ni = noise(pos * (5.0 + float(i) * 2.0) + u_time * (0.5 + float(i) * 0.2) + offset);
        density += smoothstep(0.0, 0.1, ni - 0.5);
    }

    float snow = snowParticle + (1.0 - density) * 100.0;


    float globe = sdSphere(pos, 0.6); // Match the radius of the glass sphere

    // Maximum of the snow and globe distances to confine snow inside
    return max(snow, globe);
}

// Distance Function

// Combines SDFs to determine the closest distance
vec2 map(vec3 p) {
    float dBall = shapeBall(p);
    float dSnow = shapeSnow(p);
    float dSupport = shapeSupport(p);

    float minDist = dSnow;
    float materialID = 2.0; 

    if (dBall < minDist) {
        minDist = dBall;
        materialID = 1.0; 
    }

    if (dSupport < minDist) {
        minDist = dSupport;
        materialID = 3.0; // 3: support (base)
    }

    return vec2(minDist, materialID);
}

vec3 GetNormal(vec3 p) {
    float eps = 0.0001;
    float dx = map(p + vec3(eps, 0.0, 0.0)).x - map(p - vec3(eps, 0.0, 0.0)).x;
    float dy = map(p + vec3(0.0, eps, 0.0)).x - map(p - vec3(0.0, eps, 0.0)).x;
    float dz = map(p + vec3(0.0, 0.0, eps)).x - map(p - vec3(0.0, 0.0, eps)).x;
    return normalize(vec3(dx, dy, dz));
}

// Shading 

// Snow particles
vec3 shadeSnow(vec3 pos, vec3 ray) {
    vec3 norm = GetNormal(pos);

    vec3 ambient = ambientLight * vec3(1.0) * 3.0; 
    ambient *= 1.2; // Increase ambient intensity for snow

    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor * vec3(1.0);

    return ambient + diffuse;
}

// Base of the snowglobe
vec3 shadeSupport(vec3 pos, vec3 ray) {
    vec3 norm = GetNormal(pos);

    vec3 ambient = ambientLight * vec3(0.8, 0.5, 0.3); // Base color

    // Diffuse shading
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor * vec3(0.8, 0.5, 0.3);

    return ambient + diffuse;
}

// Glass sphere
vec3 shadeBall(vec3 pos, vec3 ray) {
    float ior = 1.0 / 1.5; // Correct index of refraction for air to glass
    vec3 norm = GetNormal(pos);

    // Refraction
    vec3 refrRay = refract(ray, norm, ior);
    if (length(refrRay) == 0.0) {
        // Total internal reflection
        refrRay = reflect(ray, norm);
    }
    vec3 refrPos = pos + refrRay * 0.005; // Small offset to prevent self-intersection

    // Trace refracted ray
    float ts = 0.0;
    int refrHitType = 0;
    bool refrHit = false;
    vec3 p;

    for (int i = 0; i < MAX_STEPS; i++) {
        p = refrPos + refrRay * ts;
        vec2 res = map(p);
        float d = res.x;

        // If the distance is less than SURFACE_DIST and we're not hitting the glass sphere again
        if (d < SURFACE_DIST) {
            int hitID = int(res.y);
            // Ignore the glass sphere itself (materialID == 1)
            if (hitID != 1) {
                refrHit = true;
                refrHitType = hitID;
                break;
            }
        }
        ts += d;
        if (ts > MAX_DIST) {
            break;
        }
    }

    vec3 col;
    if (refrHit) {
        if (refrHitType == 2) {
            // Hit the snow
            col = shadeSnow(p, refrRay);
        } else if (refrHitType == 3) {
            // Hit the support (base)
            col = shadeSupport(p, refrRay);
        } else {
            // Hit other objects (if any)
            col = ambientLight * vec3(0.1);
        }
    } else {
        // Didn't hit anything, use background color
        col = getBackgroundColor();
    }

    vec3 reflColor = getBackgroundColor(); // Reflection color (adjust as needed)

    // Fresnel effect
    float fresnel = pow(1.0 - max(dot(norm, -ray), 0.0), 3.0);
    col = mix(col, reflColor, fresnel);

    // Lighting on the globe surface
    // Ambient light
    vec3 ambient = ambientLight * vec3(0.9, 0.9, 0.95); // Slightly bluish glass color

    // Diffuse shading
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor * vec3(0.9, 0.9, 0.95);

    // Specular shading (optional)
    vec3 viewDir = normalize(-ray);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
    vec3 specular = spec * lightColor;

    // Combine
    col += ambient + diffuse + specular;

    return col;
}

// Main Function

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
        // Use gradient background color
        color = getBackgroundColor();;
    }

    gl_FragColor = vec4(color, 1.0);
}
