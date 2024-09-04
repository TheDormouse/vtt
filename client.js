// Set up the scene, camera, and renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Black background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

let gridSize, cellSize, gridGroup, grid, player;

// Add these variables near the top of your file, with other global variables
let speed = 50; // Speed in feet per 6 seconds
const gridCellSize = 5; // Each grid cell represents 5 feet
let currentPath = null;
let isMoving = false;
let isDragging = false;
let ghostToken = null;
let pathArrow = null;
let lastValidPosition = null;
let invalidPositionMarker = null;

// Add these new variables
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

// Add this new variable near the top of your file
let nonWalkableMeshes = [];

// Add these new variables near the top of your file
let isPanning = false;
let panStart = new THREE.Vector2();
let zoomSpeed = 0.1;
let minZoom = 0.5;
let maxZoom = 2;

// Add these new variables near the top of your file
let anchors = [];
let isAnchoring = false;

// Add these new variables near the top of your file
let tokenSource = 'glb'; // Switch to 'glb'
const glbSource = '/vtt/Barbarian.glb';
const glbTexturePath = '/vtt/barbarian_texture.png';

// Add these variables near the top of your file
let ambientLight, directionalLight;

// Update the scene setup (replace the existing scene setup)
scene.background = new THREE.Color(0x000000); // Black background

// Add ambient and directional lights
ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
scene.add(ambientLight);

directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight);

// Load the map image and set up the grid
const mapLoader = new THREE.TextureLoader();
mapLoader.load(
    'map.jpeg',
    (mapTexture) => {
        const aspectRatio = mapTexture.image.width / mapTexture.image.height;
        gridSize = 10; // We'll keep 10x10 grid, but adjust cell size
        cellSize = aspectRatio > 1 ? aspectRatio : 1; // Adjust cellSize based on aspect ratio

        // Create map background
        const mapGeometry = new THREE.PlaneGeometry(gridSize * cellSize, gridSize * cellSize);
        const mapMaterial = new THREE.MeshBasicMaterial({ map: mapTexture });
        const mapMesh = new THREE.Mesh(mapGeometry, mapMaterial);
        mapMesh.position.z = -0.01; // Slightly behind the grid
        scene.add(mapMesh);

        // Create grid
        gridGroup = new THREE.Group();
        grid = [];

        for (let i = 0; i < gridSize; i++) {
            grid[i] = [];
            for (let j = 0; j < gridSize; j++) {
                const cellGeometry = new THREE.PlaneGeometry(cellSize, cellSize);
                const cellMaterial = new THREE.MeshBasicMaterial({ 
                    color: 0xffffff, 
                    wireframe: true, 
                    transparent: true, 
                    opacity: 0.3 
                });
                const cell = new THREE.Mesh(cellGeometry, cellMaterial);
                
                cell.position.set(
                    (i - gridSize / 2 + 0.5) * cellSize,
                    (j - gridSize / 2 + 0.5) * cellSize,
                    0
                );
                
                gridGroup.add(cell);
                grid[i][j] = { mesh: cell, walkable: true };
            }
        }

        scene.add(gridGroup);

        // Call the function to set non-walkable tiles
        setNonWalkableTiles();

        // Load player based on tokenSource
        if (tokenSource === 'glb') {
            loadGLBToken();
        }
    },
    undefined,
    (error) => console.error('An error occurred while loading the map texture:', error)
);

// Add these new variables near the top of your file
let mixer, currentAction, idleAction, walkingAction;

// Update the transitionToAnimation function
function transitionToAnimation(newAction, duration = 0.5) {
    if (currentAction && currentAction !== newAction) {
        currentAction.fadeOut(duration);
    }
    newAction.reset().fadeIn(duration).play();
    currentAction = newAction;
}

// In the loadGLBToken function, update the animation setup
function loadGLBToken() {
    const loader = new THREE.GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load(glbTexturePath, (texture) => {
        loader.load(
            glbSource,
            (gltf) => {
                player = gltf.scene;
                player.scale.set(cellSize / 2, cellSize / 2, cellSize / 2);
                player.position.set(0, 0, 0);
                player.rotation.x = Math.PI / 2;
                player.rotation.y = -Math.PI;
                player.rotation.z = 0;

                const box = new THREE.Box3().setFromObject(player);
                const size = box.getSize(new THREE.Vector3());
                player.position.z = size.y / 2;

                player.traverse((child) => {
                    if (child.isMesh) {
                        child.material.map = texture;
                        child.material.needsUpdate = true;
                        child.material.metalness = 0.2;
                        child.material.roughness = 0.8;
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                scene.add(player);

                // Set up animations
                mixer = new THREE.AnimationMixer(player);
                const animations = gltf.animations;
                idleAction = mixer.clipAction(animations.find(a => a.name === 'Idle'));
                walkingAction = mixer.clipAction(animations.find(a => a.name === 'Walking_A'));

                // Stop all animations and play only the idle animation
                mixer.stopAllAction();
                transitionToAnimation(idleAction);

                // Adjust camera to focus on the player
                camera.position.set(player.position.x, player.position.y - 10, player.position.z + 10);
                camera.lookAt(player.position);

                render(); // Render the scene
            },
            undefined,
            (error) => console.error('An error occurred while loading the GLB model:', error)
        );
    }, undefined, (error) => console.error('An error occurred while loading the GLB texture:', error));
}

// Update the animate function
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (player && mixer) {
        mixer.update(delta);
    }
    updateCameraPosition();
    render();
}

// Update these variables near the top of your file
let cameraOffset = new THREE.Vector2(0, 0);
const CAMERA_HEIGHT = 10; // Adjust this value to change the camera height

// Update the updateCameraPosition function
function updateCameraPosition() {
    if (player) {
        camera.position.x = player.position.x + cameraOffset.x;
        camera.position.y = player.position.y + cameraOffset.y;
        camera.position.z = CAMERA_HEIGHT;
        camera.lookAt(player.position.x + cameraOffset.x, player.position.y + cameraOffset.y, 0);
    }
}

// Update the panCamera function
function panCamera(deltaX, deltaY) {
    const panSpeed = 0.05;
    cameraOffset.x -= deltaX * panSpeed;
    cameraOffset.y += deltaY * panSpeed;
}

// Update the onMouseMove function
function onMouseMove(event) {
    if (isDragging) {
        drag(event);
    } else if (isPanning) {
        const deltaX = event.clientX - panStart.x;
        const deltaY = event.clientY - panStart.y;
        panCamera(deltaX, deltaY);
        panStart.set(event.clientX, event.clientY);
    }
}

// Update the onMouseDown function
function onMouseDown(event) {
    if (event.button === 0) { // Left mouse button
        const intersects = getIntersects(event);
        if (intersects.length > 0 && isPartOfPlayer(intersects[0].object)) {
            startDrag(event);
        } else {
            isPanning = true;
            panStart.set(event.clientX, event.clientY);
        }
    }
}

// Update the onMouseUp function
function onMouseUp(event) {
    if (isDragging) {
        endDrag(event);
    }
    isPanning = false;
}

// Update the resetCameraOffset function
function resetCameraOffset() {
    cameraOffset.set(0, 0);
}

// Update the movePlayerAlongPath function to reset the camera offset when movement starts
function movePlayerAlongPath() {
    if (!currentPath || currentPath.length < 2) {
        isMoving = false;
        transitionToAnimation(idleAction);
        return;
    }

    isMoving = true;
    transitionToAnimation(walkingAction);
    resetCameraOffset(); // Reset camera offset when movement starts

    let startTime = null;
    let start = currentPath[0];
    let end = currentPath[1];

    // Calculate duration for moving one cell based on speed
    const cellsPerSecond = speed / (6 * gridCellSize);
    let duration = 1000 / cellsPerSecond; // Duration in milliseconds for one cell movement

    // Adjust duration for diagonal movement
    const isDiagonal = Math.abs(start.x - end.x) === 1 && Math.abs(start.y - end.y) === 1;
    if (isDiagonal) {
        duration *= Math.SQRT2; // Multiply by sqrt(2) for diagonal movement
    }

    // Calculate rotation angle
    const rotationAngle = calculateRotationAngle(start, end);

    function animateStep(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const x = lerp(start.x, end.x, progress);
        const y = lerp(start.y, end.y, progress);
        
        player.position.x = (x - gridSize / 2 + 0.5) * cellSize;
        player.position.y = (y - gridSize / 2 + 0.5) * cellSize;

        // Rotate the player to face the movement direction
        player.rotation.x = Math.PI / 2; // Keep the model flat on the grid
        player.rotation.y = -rotationAngle;

        if (progress === 1) {
            currentPath.shift(); // Remove the start point
            if (currentPath.length > 1) {
                movePlayerAlongPath(); // Move to the next segment
            } else {
                isMoving = false;
                currentPath = null; // Clear the path when finished
                transitionToAnimation(idleAction);
            }
        } else {
            requestAnimationFrame(animateStep);
        }
    }

    requestAnimationFrame(animateStep);
}

// Add a clock for animation timing
const clock = new THREE.Clock();

// Update the setNonWalkableTiles function
function setNonWalkableTiles() {
    const nonWalkableTiles = [
        {x: 2, y: 2}, {x: 2, y: 3}, {x: 2, y: 4},
        {x: 3, y: 2}, {x: 3, y: 3}, {x: 3, y: 4},
        {x: 4, y: 2}, {x: 4, y: 3}, {x: 4, y: 4},
        {x: 7, y: 7}, {x: 7, y: 8}, {x: 8, y: 7}, {x: 8, y: 8}
    ];

    nonWalkableTiles.forEach(tile => {
        if (grid[tile.x] && grid[tile.x][tile.y]) {
            grid[tile.x][tile.y].walkable = false;
            const cellMesh = grid[tile.x][tile.y].mesh;
            const redMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.5
            });
            nonWalkableMeshes.push({ mesh: cellMesh, originalMaterial: cellMesh.material, redMaterial });
        }
    });
}

// A* pathfinding implementation
function aStar(start, goal) {
    const openSet = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(start, 0);
    fScore.set(start, heuristic(start, goal));

    let iterations = 0;
    const maxIterations = gridSize * gridSize; // Adjust this value if needed

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;
        const current = openSet.reduce((a, b) => fScore.get(a) < fScore.get(b) ? a : b);

        if (current.x === goal.x && current.y === goal.y) {
            return reconstructPath(cameFrom, current);
        }

        openSet.splice(openSet.indexOf(current), 1);

        for (const neighbor of getNeighbors(current)) {
            const tentativeGScore = gScore.get(current) + 1;

            if (!gScore.has(neighbor) || tentativeGScore < gScore.get(neighbor)) {
                cameFrom.set(neighbor, current);
                gScore.set(neighbor, tentativeGScore);
                fScore.set(neighbor, gScore.get(neighbor) + heuristic(neighbor, goal));

                if (!openSet.includes(neighbor)) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    return null; // No path found
}

// Update the getNeighbors function to check for walkable tiles
function getNeighbors(node) {
    const neighbors = [];
    const directions = [
        [-1, 0], [1, 0], [0, -1], [0, 1],  // Orthogonal
        [-1, -1], [-1, 1], [1, -1], [1, 1]  // Diagonal
    ];

    for (const [dx, dy] of directions) {
        const x = node.x + dx;
        const y = node.y + dy;

        if (x >= 0 && x < gridSize && y >= 0 && y < gridSize && grid[x][y].walkable) {
            neighbors.push({ x, y });
        }
    }

    return neighbors;
}

// Update the heuristic function to use Euclidean distance for better diagonal estimates
function heuristic(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        path.unshift(current);
    }
    return path;
}

// Update the updatePathArrow function
function updatePathArrow(path) {
    if (pathArrow) {
        scene.remove(pathArrow);
        pathArrow.geometry.dispose();
        pathArrow.material.dispose();
    }

    if (!path || path.length < 2) return;

    const points = path.map(p => new THREE.Vector3(
        (p.x - gridSize / 2 + 0.5) * cellSize,
        (p.y - gridSize / 2 + 0.5) * cellSize,
        0.03 // Slightly above the grid
    ));

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 64, cellSize / 10, 8, false);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    pathArrow = new THREE.Mesh(geometry, material);

    // Add an arrowhead
    const lastPoint = points[points.length - 1];
    const secondLastPoint = points[points.length - 2];
    const direction = new THREE.Vector3().subVectors(lastPoint, secondLastPoint).normalize();
    const arrowGeometry = new THREE.ConeGeometry(cellSize / 5, cellSize / 2, 8);
    const arrowMesh = new THREE.Mesh(arrowGeometry, material);
    arrowMesh.position.copy(lastPoint);
    arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

    pathArrow.add(arrowMesh);
    scene.add(pathArrow);
}

// Update these event listeners
renderer.domElement.addEventListener('mousedown', onMouseDown);
renderer.domElement.addEventListener('mousemove', onMouseMove);
renderer.domElement.addEventListener('mouseup', onMouseUp);
renderer.domElement.addEventListener('wheel', onWheel);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// Add these new functions
function onMouseDown(event) {
    if (event.button === 0) { // Left mouse button
        const intersects = getIntersects(event);
        if (intersects.length > 0 && isPartOfPlayer(intersects[0].object)) {
            startDrag(event);
        } else {
            isPanning = true;
            panStart.set(event.clientX, event.clientY);
        }
    }
}

// Add this new helper function
function isPartOfPlayer(object) {
    if (tokenSource === 'glb') {
        let current = object;
        while (current) {
            if (current === player) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }
    return false;
}

function onMouseMove(event) {
    if (isDragging) {
        drag(event);
    } else if (isPanning) {
        const deltaX = event.clientX - panStart.x;
        const deltaY = event.clientY - panStart.y;
        panCamera(deltaX, deltaY);
        panStart.set(event.clientX, event.clientY);
    }
}

function onMouseUp(event) {
    if (isDragging) {
        endDrag(event);
    }
    isPanning = false;
}

function onWheel(event) {
    event.preventDefault();
    const delta = -Math.sign(event.deltaY);
    zoomCamera(delta);
}

function onKeyDown(event) {
    if (event.code === 'Space') {
        isAnchoring = true;
    }
}

function onKeyUp(event) {
    if (event.code === 'Space') {
        isAnchoring = false;
    }
}

function panCamera(deltaX, deltaY) {
    const aspect = window.innerWidth / window.innerHeight;
    const moveX = (deltaX / window.innerWidth) * camera.right * 2;
    const moveY = (deltaY / window.innerHeight) * camera.top * 2;
    camera.position.x -= moveX;
    camera.position.y += moveY;
    camera.updateProjectionMatrix();
}

function zoomCamera(delta) {
    const zoomFactor = 1 + delta * zoomSpeed;
    const newZoom = camera.zoom * zoomFactor;
    
    if (newZoom >= minZoom && newZoom <= maxZoom) {
        camera.zoom = newZoom;
        camera.updateProjectionMatrix();
    }
}

// Helper function to get intersects
function getIntersects(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(scene.children, true);
}

// Update the startDrag function
function startDrag(event) {
    isDragging = true;
    createGhostToken();
    lastValidPosition = null;
    showNonWalkableAreas();
}

// Add these new functions
function showNonWalkableAreas() {
    nonWalkableMeshes.forEach(item => {
        item.mesh.material = item.redMaterial;
    });
}

function hideNonWalkableAreas() {
    nonWalkableMeshes.forEach(item => {
        item.mesh.material = item.originalMaterial;
    });
}

function createGhostToken() {
    if (ghostToken) removeGhostToken();

    if (tokenSource === 'glb') {
        ghostToken = player.clone();
        ghostToken.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.5;
            }
        });
    }

    ghostToken.position.copy(player.position);
    ghostToken.rotation.copy(player.rotation);
    scene.add(ghostToken);
}

// Update the removeGhostToken function
function removeGhostToken() {
    if (ghostToken) {
        scene.remove(ghostToken);
        if (tokenSource === 'glb') {
            ghostToken.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        }
        ghostToken = null;
    }
    if (invalidPositionMarker) {
        scene.remove(invalidPositionMarker);
        invalidPositionMarker.geometry.dispose();
        invalidPositionMarker.material.dispose();
        invalidPositionMarker = null;
    }
}

function showInvalidPositionMarker() {
    if (!invalidPositionMarker) {
        const markerGeometry = new THREE.BufferGeometry();
        const markerMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });

        const size = cellSize * 0.4;
        const vertices = new Float32Array([
            -size, -size, 0,
            size, size, 0,
            -size, size, 0,
            size, -size, 0
        ]);

        markerGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        invalidPositionMarker = new THREE.LineSegments(markerGeometry, markerMaterial);
        invalidPositionMarker.position.z = 0.04; // Slightly above the ghost token
        scene.add(invalidPositionMarker);
    }

    if (ghostToken) {
        invalidPositionMarker.position.x = ghostToken.position.x;
        invalidPositionMarker.position.y = ghostToken.position.y;
    }
    invalidPositionMarker.visible = true;

    // Remove the path arrow when showing invalid position marker
    if (pathArrow) {
        scene.remove(pathArrow);
        pathArrow.geometry.dispose();
        pathArrow.material.dispose();
        pathArrow = null;
    }
}

function removeInvalidPositionMarker() {
    if (invalidPositionMarker) {
        invalidPositionMarker.visible = false;
    }
}

// Update the calculateRotationAngle function
function calculateRotationAngle(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.atan2(dx, dy) + Math.PI; // Add Math.PI to adjust for the initial 180-degree rotation
}

// Helper function for linear interpolation
function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

// Update the render function to include shadow rendering
function render() {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.render(scene, camera);
}

// Start the animation loop
animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
});

// Log any Three.js warnings or errors
THREE.onError = function(error) {
    console.error('Three.js error:', error);
};

// Add this function to provide feedback for cancelled movement
function showCancelledMovementFeedback() {
    const feedbackMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
    const feedbackGeometry = new THREE.CircleGeometry(cellSize / 2, 32);
    const feedbackMesh = new THREE.Mesh(feedbackGeometry, feedbackMaterial);
    feedbackMesh.position.copy(player.position);
    feedbackMesh.position.z = 0.03; // Slightly above the player
    scene.add(feedbackMesh);

    // Animate the feedback
    const startOpacity = 0.5;
    const duration = 500; // milliseconds
    const startTime = performance.now();

    function animateFeedback(time) {
        const elapsed = time - startTime;
        if (elapsed < duration) {
            const progress = elapsed / duration;
            feedbackMesh.material.opacity = startOpacity * (1 - progress);
            requestAnimationFrame(animateFeedback);
        } else {
            scene.remove(feedbackMesh);
            feedbackMesh.geometry.dispose();
            feedbackMesh.material.dispose();
        }
        render();
    }

    requestAnimationFrame(animateFeedback);
}

// Add these new functions
function drag(event) {
    const intersects = getIntersects(event);
    if (intersects.length > 0) {
        const intersect = intersects[0];
        const x = Math.floor((intersect.point.x / cellSize) + (gridSize / 2));
        const y = Math.floor((intersect.point.y / cellSize) + (gridSize / 2));

        if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
            ghostToken.position.x = (x - gridSize / 2 + 0.5) * cellSize;
            ghostToken.position.y = (y - gridSize / 2 + 0.5) * cellSize;

            if (grid[x][y].walkable) {
                removeInvalidPositionMarker();
                lastValidPosition = { x, y };
                
                if (isAnchoring && (!anchors.length || (anchors[anchors.length - 1].x !== x || anchors[anchors.length - 1].y !== y))) {
                    anchors.push({ x, y });
                }
                
                const start = {
                    x: Math.floor((player.position.x / cellSize) + (gridSize / 2)),
                    y: Math.floor((player.position.y / cellSize) + (gridSize / 2))
                };
                const path = calculatePathWithAnchors(start, { x, y });
                updatePathArrow(path);
            } else {
                showInvalidPositionMarker();
                lastValidPosition = null; // Reset lastValidPosition when over unwalkable area
            }
        }
    }
}

// Add this new function to calculate path with anchors
function calculatePathWithAnchors(start, end) {
    let fullPath = [start];  // Start with the initial position
    let currentStart = start;

    for (const anchor of anchors) {
        const pathSegment = aStar(currentStart, anchor);
        if (pathSegment) {
            fullPath = fullPath.concat(pathSegment.slice(1));
            currentStart = anchor;
        } else {
            // If a segment is not possible, break the loop
            return null;
        }
    }

    const finalSegment = aStar(currentStart, end);
    if (finalSegment) {
        fullPath = fullPath.concat(finalSegment.slice(1));
        return fullPath;
    }

    return null;
}

// Update the endDrag function
function endDrag(event) {
    isDragging = false;
    hideNonWalkableAreas();
    removeGhostToken();

    if (pathArrow) {
        scene.remove(pathArrow);
        pathArrow.geometry.dispose();
        pathArrow.material.dispose();
        pathArrow = null;
    }

    if (lastValidPosition) {
        const start = {
            x: Math.floor((player.position.x / cellSize) + (gridSize / 2)),
            y: Math.floor((player.position.y / cellSize) + (gridSize / 2))
        };
        currentPath = calculatePathWithAnchors(start, lastValidPosition);
        if (currentPath) {
            movePlayerAlongPath();
        }
    } else {
        showCancelledMovementFeedback();
    }

    // Reset anchors and lastValidPosition
    anchors = [];
    lastValidPosition = null;
}
