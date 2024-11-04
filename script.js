async function readShader(id) {
  const req = await fetch(document.getElementById(id).src);
  return await req.text();
}

function createShader(gl, type, src) {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);

  let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) return shader;

  console.error("Could not compile WebGL Shader", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
}

function createProgram(gl, vertShader, fragShader) {
  let program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  let success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) return program;

  console.error("Could not Link WebGL Program", gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
}

async function main() {
  const canvas = document.getElementById("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) alert("Could not initialize WebGL Context.");

  // Resize canvas to fit the window
  function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Camera parameters
  let camera = {
    rotation: { x: 0, y: 0 }, // Rotation angles (pitch and yaw)
    zoom: 2.0 // Zoom distance
  };

  // Mouse controls
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', function (e) {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mousemove', function (e) {
    if (isDragging) {
      let deltaX = e.clientX - previousMousePosition.x;
      let deltaY = e.clientY - previousMousePosition.y;

      camera.rotation.x += deltaY * 0.005;
      camera.rotation.y += deltaX * 0.005;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    }
  });

  canvas.addEventListener('mouseup', function (e) {
    isDragging = false;
  });

  canvas.addEventListener('mouseleave', function (e) {
    isDragging = false;
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    camera.zoom += e.deltaY * 0.01;
    camera.zoom = Math.max(0.5, Math.min(5.0, camera.zoom)); // Clamping zoom level
  });

  // Touch controls
  let isTouchDragging = false;
  let previousTouchPosition = { x: 0, y: 0 };
  let initialPinchDistance = 0;
  let initialZoom = camera.zoom;

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      isTouchDragging = true;
      previousTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isTouchDragging = false;
      initialPinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialZoom = camera.zoom;
    }
  });

  canvas.addEventListener('touchmove', function (e) {
    if (isTouchDragging && e.touches.length === 1) {
      let deltaX = e.touches[0].clientX - previousTouchPosition.x;
      let deltaY = e.touches[0].clientY - previousTouchPosition.y;

      camera.rotation.x += deltaY * 0.005;
      camera.rotation.y += deltaX * 0.005;

      previousTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      let pinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      let deltaDistance = pinchDistance - initialPinchDistance;
      camera.zoom = initialZoom - deltaDistance * 0.01;
      camera.zoom = Math.max(0.5, Math.min(5.0, camera.zoom)); // Clamping zoom level
    }
  });

  canvas.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      isTouchDragging = false;
    }
  });

  const vertShader = createShader(gl, gl.VERTEX_SHADER, await readShader("vert")); // prettier-ignore
  const fragShader = createShader(gl, gl.FRAGMENT_SHADER, await readShader("frag")); // prettier-ignore
  const program = createProgram(gl, vertShader, fragShader);

  const a_position = gl.getAttribLocation(program, "a_position");
  const a_uv = gl.getAttribLocation(program, "a_uv");

  const u_resolution = gl.getUniformLocation(program, "u_resolution");
  const u_time = gl.getUniformLocation(program, "u_time");
  const u_cameraRotation = gl.getUniformLocation(program, "u_cameraRotation");
  const u_cameraZoom = gl.getUniformLocation(program, "u_cameraZoom");

  // prettier-ignore
  const data = new Float32Array([
    // x    y       u    v
    -1.0, -1.0,   0.0, 0.0,
     1.0, -1.0,   1.0, 0.0,
     1.0,  1.0,   1.0, 1.0,
    -1.0,  1.0,   0.0, 1.0,
  ]);
  // prettier-ignore
  const indices = new Uint16Array([
    0, 1, 2,
    0, 2, 3,
  ]);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(a_position);
  gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 4 * 4, 0);
  gl.enableVertexAttribArray(a_uv);
  gl.vertexAttribPointer(a_uv, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  let startTime = Date.now();

  function render() {
    resizeCanvas();
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindVertexArray(vao);
    gl.useProgram(program);

    gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(u_time, (Date.now() - startTime) * 0.001);
    gl.uniform2f(u_cameraRotation, camera.rotation.x, camera.rotation.y);
    gl.uniform1f(u_cameraZoom, camera.zoom);

    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main();
