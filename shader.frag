precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_cameraRotation; // x: pitch, y: yaw
uniform float u_cameraZoom;

#define PI 3.1415926535897932384626433832795
#define MAX_STEPS 100
#define MAX_DIST 20.0
#define SURFACE_DIST 0.001

// Helper functions
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

float noise(in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    float n = p.x + p.y * 57.0 + 113.0 * p.z;

    return mix(
        mix(
            mix(hash(n + 0.0), hash(n + 1.0), f.x),
            mix(hash(n + 57.0), hash(n + 58.0), f.x),
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

float sdSphere(vec3 p, float s) {
    return length(p) - s;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float phong(vec3 l, vec3 e, vec3 n, float power) {
    float nrm = (power + 8.0) / (PI * 8.0);
    return pow(max(dot(l, reflect(e, n)), 0.0), power) * nrm;
}

// Shape functions
float shapeBall(vec3 pos) {
    return sdSphere(pos, 0.6);
}

float shapeSnow(vec3 pos) {
    float dp = pos.y + 0.3;
    dp += noise(pos.xzy * 123.0) * 0.01;
    dp += noise(pos.xzy * 35.12679) * 0.02;

    vec3 poss1 = pos + vec3(0.0, 0.2, 0.0);
    poss1 *= 0.99 + noise(pos * 200.0) * 0.01;

    vec3 poss2 = pos - vec3(0.0, 0.05, 0.0);
    poss2 *= 0.99 + noise(pos * 200.0) * 0.02;

    float ds1 = sdSphere(poss1, 0.2);
    float ds2 = sdSphere(poss2, 0.13);

    ds1 = smin(ds1, ds2, 0.03);
    dp = smin(dp, ds1, 0.05);

    return max(dp, shapeBall(pos + 0.1));
}

// Distance function
float map(vec3 p) {
    float dBall = shapeBall(p);
    float dSnow = shapeSnow(p);
    return min(dBall, dSnow);
}

// Function to compute normals using the gradient of the distance function
vec3 GetNormal(vec3 p) {
    float eps = 0.001;
    vec3 n;
    n.x = map(p + vec3(eps, 0.0, 0.0)) - map(p - vec3(eps, 0.0, 0.0));
    n.y = map(p + vec3(0.0, eps, 0.0)) - map(p - vec3(0.0, eps, 0.0));
    n.z = map(p + vec3(0.0, 0.0, eps)) - map(p - vec3(0.0, 0.0, eps));
    return normalize(n);
}

// Shading function for the snowglobe
vec3 shadeBall(vec3 pos, vec3 ray) {
    float ior = 0.98; // Index of refraction
    vec3 norm = normalize(pos);

    // Refraction
    vec3 refrRay = normalize(refract(ray, norm, ior));
    vec3 refrPos = pos + refrRay * 0.001;

    // Reflection
    vec3 reflRay = normalize(reflect(ray, norm));
    vec3 reflPos = pos + reflRay * 0.001;

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
        vec3 normSnow = GetNormal(p);
        float diff = max(dot(normSnow, vec3(0.0, 1.0, 0.0)), 0.0);
        col = vec3(0.8) * diff;
    } else {
        col = vec3(0.5); // Inside the globe
    }

    // Reflection (using background color)
    vec3 reflColor = vec3(0.0); // Assuming black background

    // Fresnel effect
    float fresnel = pow(1.0 - max(dot(norm, -ray), 0.0), 3.0);
    col = mix(col, reflColor, fresnel);

    return col;
}

void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5) * 2.0;
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

    // Camera direction
    vec3 forward = normalize(-ro); // Looking at the origin
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);

    // Construct ray direction
    vec3 rd = normalize(uv.x * right + uv.y * up + forward);

    // Ray marching
    float t = 0.0;
    bool hit = false;
    vec3 p;
    for (int i = 0; i < MAX_STEPS; i++) {
        p = ro + t * rd;
        float d = map(p);
        if (d < SURFACE_DIST) {
            hit = true;
            break;
        }
        t += d;
        if (t > MAX_DIST) {
            break;
        }
    }

    vec3 color = vec3(0.0);
    if (hit) {
        color = shadeBall(p, rd);
    } else {
        // Background color
        color = vec3(0.0); // Black background
    }

    gl_FragColor = vec4(color, 1.0);
}
