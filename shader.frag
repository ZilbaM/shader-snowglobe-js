precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_cameraRotation; // x: pitch, y: yaw
uniform float u_cameraZoom;

varying vec2 v_uv;

// Signed distance function for a box
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, vec3(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Approximate surface normal
vec3 getNormal(vec3 p) {
    float eps = 0.001;
    vec3 n = vec3(
        sdBox(p + vec3(eps, 0.0, 0.0), vec3(0.5)) - sdBox(p - vec3(eps, 0.0, 0.0), vec3(0.5)),
        sdBox(p + vec3(0.0, eps, 0.0), vec3(0.5)) - sdBox(p - vec3(0.0, eps, 0.0), vec3(0.5)),
        sdBox(p + vec3(0.0, 0.0, eps), vec3(0.5)) - sdBox(p - vec3(0.0, 0.0, eps), vec3(0.5))
    );
    return normalize(n);
}

// Distance function
float map(vec3 p) {
    // Cube of size 1 centered at the origin
    return sdBox(p, vec3(0.5));
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

    // Target position
    vec3 target = vec3(0.0);

    // Camera direction
    vec3 forward = normalize(target - ro);

    // Right and up vectors
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);

    // Construct ray direction
    vec3 rd = normalize(uv.x * right + uv.y * up + forward);

    // Ray marching
    float t = 0.0;
    bool hit = false;
    vec3 p;
    for (int i = 0; i < 100; i++) {
        p = ro + t * rd;
        float dist = map(p);
        if (dist < 0.001) {
            hit = true;
            break;
        }
        t += dist;
        if (t > 20.0) break;
    }

    vec3 color = vec3(0.0);

    if (hit) {
        // Lighting
        vec3 normal = getNormal(p);
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float diff = max(dot(normal, lightDir), 0.0);
        color = vec3(0.8, 0.5, 0.3) * diff; // Cube color with shading
    } else {
        // Background color
        color = vec3(0.1, 0.1, 0.1);
    }

    gl_FragColor = vec4(color, 1.0);
}
