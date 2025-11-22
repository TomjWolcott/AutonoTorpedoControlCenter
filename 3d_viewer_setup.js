import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const infoAccordionInfo = document.getElementById("accordion-info-area");

const scene = new THREE.Scene();

// const camera = new THREE.PerspectiveCamera( 75, 1, 0.1, 1000 );
const camera = new THREE.OrthographicCamera( -2, 2, 2, -2 );

const renderer = new THREE.WebGLRenderer( { alpha: true } );

threejs_setup();

function threejs_setup() {
    setScreenSize();

    let dom3dViewer = document.getElementById("3d-viewer");
    if (dom3dViewer == null) return;

    dom3dViewer.appendChild( renderer.domElement );

    const controls = new OrbitControls( camera, renderer.domElement );
    const loader = new GLTFLoader();

    const color = 0xFFFFFF;
    const intensity = 1;
    const light = new THREE.AmbientLight(color, intensity);
    scene.add(light);
    const light2 = new THREE.DirectionalLight(color, intensity);
    light2.position.set(0, 10, 0);
    light2.target.position.set(-5, 0, 0);
    scene.add(light2);
    scene.add(light2.target);

    const light3 = new THREE.DirectionalLight(color, intensity);
    light3.position.set(5, -10, 0);
    light3.target.position.set(-5, 5, 5);
    scene.add(light3);
    scene.add(light3.target);
    const axesHelper = new THREE.AxesHelper( 5 );
    scene.add( axesHelper );
    const axesHelperRev = new THREE.AxesHelper( -5 );
    scene.add( axesHelperRev );

    // let dir = new THREE.Vector3(1, 1, 1);
    // dir.normalize();
    // const arrowHelper = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), 1, 0xffffff );
    // scene.add( arrowHelper );
    var AT;
    loader.load( 'assets/AutonomousTorpedo.glb', function ( gltf ) {
        AT = gltf.scene;
        gltf.scene.scale.set(20, 20, 20);
        scene.add( gltf.scene );
    }, undefined, function ( error ) {
        console.error( error );
    } );

    camera.position.set( 2, 1, 2 );
    controls.update();

    function animate() {
        controls.update();
        renderer.render( scene, camera );

        if (typeof AT != "undefined") {
            AT.setRotationFromEuler(new THREE.Euler( 0, 0, 0, 'XYZ' ));

            let magv = new THREE.Vector3(-mag[0], mag[2], mag[1]);
            let accv = new THREE.Vector3(-acc[1], acc[2], acc[0]);

            magv.normalize();
            accv.normalize();

            let y_rot = Math.atan2(accv.x, accv.y);
            let x_rot = Math.atan2(accv.z, accv.y);

            magv = magv.applyAxisAngle( new THREE.Vector3(0, 0, 1), -y_rot);
            magv = magv.applyAxisAngle( new THREE.Vector3(1, 0, 0), -x_rot);

            let z_rot = Math.atan2(magv.z, magv.x);

            AT.rotateY(z_rot);
            AT.rotateZ(y_rot);
            AT.rotateX(x_rot);
        }
    }
    renderer.setAnimationLoop( animate );
}

new ResizeObserver(setScreenSize).observe(infoAccordionInfo);

function setScreenSize() {
    const sceneSize = infoAccordionInfo.getBoundingClientRect().width - 40;
    // const sceneSize = infoAccordionInfo.offsetWidth;
    renderer.setSize( sceneSize, sceneSize );

    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "auto";
}