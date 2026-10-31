// Stewart Platform (Ball & Plate) Simulator - 3D & Physics Engine
const SimConfig = {
    // Mechanical Dimensions (in cm, scaled for 3D view - matches physical 3D printed build)
    TABAN_YARICAPI: 11.0,
    PLATFORM_YARICAPI: 5.6,  // Fits completely underneath 13.0cm x 22.2cm screen tray (5.6cm < 6.5cm)
    SERVO_KOL_UZUNLUGU: 4.2,
    BACAK_UZUNLUGU: 21.5,
    Z_YUKSEKLIK: 19.5,
    
    // Screen Dimensions (in mm, as defined in Arduino)
    EKRAN_GENISLIK: 222,
    EKRAN_YUKSEKLIK: 130,
    
    // Limits
    MAX_EGIM: 7.0,      // Derece
    MAX_EGIM_ADIM: 0.25, // Bir döngüde maksimum açı adımı

    // Arduino kontrolcüsüyle birebir aynı sabitler
    FILTRE_YENI_ORAN: 0.30,
    DEAD_BAND: 4.0,
    INTEGRAL_LIMIT: 300.0,
    HIZ_LIMIT: 500.0,
    X_TERS: 1,
    Y_TERS: 0,
    EKSEN_DEGISTIR: 1,

    // ESP32 loop() süresi tahmini: 8 örnek x 2 okuma x 1 ms + 1 ms temas + delay(10) + hesap ≈ 30 ms
    KONTROL_PERIYODU: 0.030, // saniye

    // Fizik: içi dolu kürenin yuvarlanması için ivme katsayısı (5/7)
    YUVARLANMA_KATSAYISI: 5.0 / 7.0,
    SURTUNME: 0.25
};

// Arduino ekranKonumOku() içindeki dönüşüm katsayıları
const ROT_A = 130.0 / 257.0;
const ROT_B = 222.0 / 257.0;

class StewartSimulator {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // 3D Objects
        this.basePlate = null;
        this.topPlate = null;
        this.servoBases = [];
        this.servoArms = [];
        this.legs = [];
        this.ball = null;
        this.targetMarker = null;
        
        // Angles and joints setup (degrees)
        // Arduino: float motor_acilar[6] = {330, 30, 90, 150, 210, 270};
        this.motorAngles = [330, 30, 90, 150, 210, 270].map(a => a * Math.PI / 180);
        this.platformAngles = [330, 30, 90, 150, 210, 270].map(a => a * Math.PI / 180);
        
        // Current state variables (X, Y in mm, angles in degrees)
        this.state = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            roll: 0,
            pitch: 0,
            yaw: 0,
            height: SimConfig.Z_YUKSEKLIK,
            
            // For offline simulation mode
            simulated: {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                roll: 0,
                pitch: 0,
                targetX: 0,
                targetY: 0,
                
                // PID parameters
                kp: 0.035,
                kd: 0.012,
                ki: 0.000,
                
                x_integral: 0,
                y_integral: 0,

                // Arduino loop() ile aynı filtre / türev hafızası (kontrol ekseninde)
                x_filtre: 0,
                y_filtre: 0,
                x_onceki: 0,
                y_onceki: 0,
                ilk_okuma: true,
                kontrolBirikim: 0,
                
                lastTime: 0,
                ballOnPlate: true,

                // Elle tutma / bırakma durumu
                // mode: 'none' (fizik normal), 'held' (elde), 'dropping' (düşüyor), 'floor' (yerde)
                hand: {
                    mode: 'none',
                    pos: new THREE.Vector3(),   // 'held'/'dropping': plaka yerel (cm), 'floor': dünya (cm)
                    vel: new THREE.Vector3(),   // cm/s
                    holdHeight: 7.0,            // ekran yüzeyinden tutma yüksekliği (cm)
                    lastPos: null,
                    lastT: 0
                }
            }
        };

        this.initThree();
        this.createModel();
        this.animate();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    initThree() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = null; // Let the CSS gradient show through
        
        // Camera (Bird's eye 3/4 perspective showing both top screen surface and Stewart legs)
        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
        this.camera.position.set(22, -34, 28);
        this.camera.up.set(0, 0, 1); // Z-axis is UP
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        
        // Orbit Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 11); // Center view vertically on the entire Stewart Platform assembly
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
        this.controls.minDistance = 15;
        this.controls.maxDistance = 80;
        
        // Lights (Studio Key + Fill + Cyan Rim Lighting for Metallic PBR Highlights)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);
        
        // Key Light
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
        dirLight.position.set(25, -25, 45);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 100;
        const d = 22;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        this.scene.add(dirLight);
        
        // Blue/Cyan Rim Light (Highlights CNC edges and carbon fiber)
        const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
        rimLight.position.set(-30, 25, 20);
        this.scene.add(rimLight);

        // Warm Fill Light from underneath
        const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.4);
        fillLight.position.set(0, -30, -10);
        this.scene.add(fillLight);
        
        const pointLight = new THREE.PointLight(0x6366f1, 1.5, 60);
        pointLight.position.set(0, 0, 14);
        this.scene.add(pointLight);

        // Ground Grid (Subtle high-tech floor)
        const gridHelper = new THREE.GridHelper(60, 30, 0x4f46e5, 0x1e293b);
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.position.z = -1;
        this.scene.add(gridHelper);
    }

    createModel() {
        // High-Fidelity PBR Materials - Calibrated to match physical 3D-printed Stewart Platform
        // 1. Royal Blue 3D-Printed PLA/PETG Plastic (Base chassis, top platform bracket, servo arms)
        const matRoyalBlue = new THREE.MeshStandardMaterial({ 
            color: 0x1d4ed8, 
            roughness: 0.42,
            metalness: 0.08
        });

        // 2. Dark Grey / Anthracite Bezel Frame for Touch Screen Tray
        const matScreenFrame = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.52,
            metalness: 0.15
        });

        // 3. Touch Screen Panel (Dark Glass with fine anti-glare)
        const materialPlate = new THREE.MeshStandardMaterial({ 
            color: 0x090d16, 
            roughness: 0.12,
            metalness: 0.88,
            transparent: true,
            opacity: 0.95
        });

        // 4. Vibrant Cyan / Sky Blue Plastic Rod Ends (Upper & lower ball joint clevises)
        const matCyanJoint = new THREE.MeshStandardMaterial({
            color: 0x0284c7, // Distinctive light blue/cyan rod-ends from physical build
            roughness: 0.35,
            metalness: 0.10
        });

        // 5. Polished High-Shine Chrome / Steel Pushrods (Pushrod shafts)
        const matPushrod = new THREE.MeshStandardMaterial({
            color: 0xf1f5f9,
            roughness: 0.12,
            metalness: 0.96
        });

        // 6. MG996R Servo Black Enclosure
        const matServoBody = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.58,
            metalness: 0.22
        });

        // 7. MG996R Iconic Pink/Magenta Side Label
        const matServoLabel = new THREE.MeshStandardMaterial({
            color: 0xdb2777,
            roughness: 0.35,
            metalness: 0.08
        });

        // 8. White Number / Identification Sticker on Blue Base Deck
        const matWhiteLabel = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.28,
            metalness: 0.05
        });

        // 9. Black Wooden Stand / Pedestal underneath Base
        const matPedestal = new THREE.MeshStandardMaterial({
            color: 0x0f1117,
            roughness: 0.72,
            metalness: 0.06
        });

        // 10. Hardware Screws & Bolts (Bright Chrome)
        const matChrome = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.10,
            metalness: 0.98
        });

        // 11. Steel Ball
        const materialBall = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.08,
            metalness: 0.95,
            clearcoat: 1.0
        });

        // -------------------------------------------------------------
        // 1. BASE ASSEMBLY (Pedestal + 3D-Printed Hexagonal Chassis)
        // -------------------------------------------------------------
        const baseGroup = new THREE.Group();

        // A. Black Wooden Pedestal / Stand (Elevating structure at bottom)
        const pedestalGeom = new THREE.CylinderGeometry(11.8, 13.8, 5.5, 6);
        const pedestalMesh = new THREE.Mesh(pedestalGeom, matPedestal);
        pedestalMesh.rotation.x = Math.PI / 2;
        pedestalMesh.position.z = -2.8;
        pedestalMesh.receiveShadow = true;
        baseGroup.add(pedestalMesh);

        // B. Royal Blue 3D-Printed Main Base Chassis (Hexagonal with chamfers)
        const baseThickness = 1.6;
        const baseGeom = new THREE.CylinderGeometry(SimConfig.TABAN_YARICAPI + 0.8, SimConfig.TABAN_YARICAPI + 0.9, baseThickness, 6);
        const baseMesh = new THREE.Mesh(baseGeom, matRoyalBlue);
        baseMesh.rotation.x = Math.PI / 2;
        baseMesh.position.z = baseThickness / 2;
        baseMesh.receiveShadow = true;
        baseGroup.add(baseMesh);

        // White identification stickers and servo bay pockets on top deck
        for (let j = 0; j < 6; j++) {
            const bAngle = this.motorAngles[j];
            const lx = (SimConfig.TABAN_YARICAPI * 0.68) * Math.cos(bAngle);
            const ly = (SimConfig.TABAN_YARICAPI * 0.68) * Math.sin(bAngle);

            // White label sticker [S1] .. [S6]
            const stickerGeom = new THREE.PlaneGeometry(1.6, 1.0);
            const sticker = new THREE.Mesh(stickerGeom, matWhiteLabel);
            sticker.position.set(lx, ly, baseThickness + 0.02);
            sticker.rotation.z = bAngle;
            baseGroup.add(sticker);

            // Pocket opening in 3D-printed chassis
            const pocketGeom = new THREE.BoxGeometry(2.8, 1.8, 0.2);
            const pocket = new THREE.Mesh(pocketGeom, matPedestal);
            const px = (SimConfig.TABAN_YARICAPI * 0.42) * Math.cos(bAngle);
            const py = (SimConfig.TABAN_YARICAPI * 0.42) * Math.sin(bAngle);
            pocket.position.set(px, py, baseThickness);
            pocket.rotation.z = bAngle;
            baseGroup.add(pocket);
        }

        this.basePlate = baseGroup;
        this.scene.add(this.basePlate);

        // -------------------------------------------------------------
        // 2. TOP SCREEN & PLATFORM ASSEMBLY (Screen Tray + Blue Sub-plate)
        // -------------------------------------------------------------
        this.topPlateGroup = new THREE.Group();

        // A. Royal Blue 3D-Printed Top Mounting Plate (STRICTLY UNDERNEATH SCREEN)
        // Radius = PLATFORM_YARICAPI (5.6 cm). Fits fully under 22.2cm x 13.0cm screen tray!
        const topSubPlateGeom = new THREE.CylinderGeometry(SimConfig.PLATFORM_YARICAPI, SimConfig.PLATFORM_YARICAPI + 0.3, 0.7, 6);
        const topSubPlate = new THREE.Mesh(topSubPlateGeom, matRoyalBlue);
        topSubPlate.rotation.x = Math.PI / 2;
        topSubPlate.position.z = -0.35; // Mounted below the screen tray
        topSubPlate.receiveShadow = true;
        this.topPlateGroup.add(topSubPlate);

        // B. Dark Grey Screen Tray (Tepsi - rectangular frame with raised lip)
        const trayW = SimConfig.EKRAN_GENISLIK / 10.0 + 1.2; // 23.4 cm
        const trayH = SimConfig.EKRAN_YUKSEKLIK / 10.0 + 1.2; // 14.2 cm
        const trayBottomGeom = new THREE.BoxGeometry(trayW, trayH, 0.3);
        const trayBottom = new THREE.Mesh(trayBottomGeom, matScreenFrame);
        trayBottom.position.z = 0.15;
        trayBottom.receiveShadow = true;
        this.topPlateGroup.add(trayBottom);

        // Raised tray border / lip around perimeter (stops ball from falling easily)
        const lipThickness = 0.5;
        const lipHeight = 0.7;

        // Long borders (Top & Bottom)
        const lipLongGeom = new THREE.BoxGeometry(trayW, lipThickness, lipHeight);
        const lipTop = new THREE.Mesh(lipLongGeom, matScreenFrame);
        lipTop.position.set(0, trayH / 2 - lipThickness / 2, 0.45);
        this.topPlateGroup.add(lipTop);

        const lipBot = new THREE.Mesh(lipLongGeom, matScreenFrame);
        lipBot.position.set(0, -trayH / 2 + lipThickness / 2, 0.45);
        this.topPlateGroup.add(lipBot);

        // Short borders (Left & Right)
        const lipShortGeom = new THREE.BoxGeometry(lipThickness, trayH - 2 * lipThickness, lipHeight);
        const lipLeft = new THREE.Mesh(lipShortGeom, matScreenFrame);
        lipLeft.position.set(-trayW / 2 + lipThickness / 2, 0, 0.45);
        this.topPlateGroup.add(lipLeft);

        const lipRight = new THREE.Mesh(lipShortGeom, matScreenFrame);
        lipRight.position.set(trayW / 2 - lipThickness / 2, 0, 0.45);
        this.topPlateGroup.add(lipRight);

        // C. Touchscreen Active Glass Surface (22.2 cm x 13.0 cm)
        const screenGeom = new THREE.BoxGeometry(
            SimConfig.EKRAN_GENISLIK / 10.0, 
            SimConfig.EKRAN_YUKSEKLIK / 10.0, 
            0.15
        );
        this.topPlate = new THREE.Mesh(screenGeom, materialPlate);
        this.topPlate.position.z = 0.35; // Sits inside tray bottom
        this.topPlate.castShadow = true;
        this.topPlate.receiveShadow = true;
        this.topPlateGroup.add(this.topPlate);

        // Subtle Touch Grid Overlay
        const gridGeom = new THREE.PlaneGeometry(SimConfig.EKRAN_GENISLIK / 10.0, SimConfig.EKRAN_YUKSEKLIK / 10.0);
        const gridMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.16
        });
        const gridMesh = new THREE.Mesh(gridGeom, gridMat);
        gridMesh.position.z = 0.44;
        this.topPlateGroup.add(gridMesh);

        // D. 6 Upper Cyan Ball Joint Rod-Ends mounted on Blue Sub-plate
        for (let i = 0; i < 6; i++) {
            const pAngle = this.platformAngles[i];
            const px = SimConfig.PLATFORM_YARICAPI * Math.cos(pAngle);
            const py = SimConfig.PLATFORM_YARICAPI * Math.sin(pAngle);

            const jointGroup = new THREE.Group();
            jointGroup.position.set(px, py, -0.35);
            jointGroup.rotation.z = pAngle;

            // Cyan rod-end bracket attached horizontally to blue plate edge
            const clevisGeom = new THREE.BoxGeometry(0.7, 0.6, 0.55);
            const clevis = new THREE.Mesh(clevisGeom, matCyanJoint);
            jointGroup.add(clevis);

            // Chrome pivot pin / bolt
            const pinGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.8, 12);
            pinGeom.rotateX(Math.PI / 2);
            const pin = new THREE.Mesh(pinGeom, matChrome);
            jointGroup.add(pin);

            this.topPlateGroup.add(jointGroup);
        }

        this.scene.add(this.topPlateGroup);

        // -------------------------------------------------------------
        // 3. ACTUATORS (MG996R Servos, Blue 3D-Printed Arms, Chrome Pushrods)
        // -------------------------------------------------------------
        for (let i = 0; i < 6; i++) {
            const bAngle = this.motorAngles[i];
            const bx = SimConfig.TABAN_YARICAPI * Math.cos(bAngle);
            const by = SimConfig.TABAN_YARICAPI * Math.sin(bAngle);

            // A. MG996R Servo Motor & Chassis Mounting Bay
            const servoGroup = new THREE.Group();
            servoGroup.position.set(bx, by, 0);
            servoGroup.rotation.set(0, 0, bAngle);

            // 3D-Printed Blue Servo Mounting Cradle
            const cradleGeom = new THREE.BoxGeometry(2.3, 4.3, 0.3);
            const cradle = new THREE.Mesh(cradleGeom, matRoyalBlue);
            cradle.position.set(0, -1.9, 0.5);
            servoGroup.add(cradle);

            // MG996R Black Main Body (Y: 4.0cm, X: 2.0cm, Z: 1.4cm)
            const bodyGeom = new THREE.BoxGeometry(1.9, 3.8, 1.3);
            const servoBody = new THREE.Mesh(bodyGeom, matServoBody);
            servoBody.position.set(0, -1.9, 1.15);
            servoGroup.add(servoBody);

            // MG996R Characteristic Pink/Magenta Product Label on Side
            const labelGeom = new THREE.PlaneGeometry(1.6, 2.4);
            const label = new THREE.Mesh(labelGeom, matServoLabel);
            label.position.set(0.96, -1.9, 1.15);
            label.rotation.y = Math.PI / 2;
            servoGroup.add(label);

            // Servo mounting ears with silver screws
            [-3.6, -0.2].forEach(yPos => {
                const earGeom = new THREE.BoxGeometry(1.9, 0.35, 0.2);
                const ear = new THREE.Mesh(earGeom, matServoBody);
                ear.position.set(0, yPos, 1.15);
                servoGroup.add(ear);

                const screwGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.35, 12);
                screwGeom.rotateX(Math.PI / 2);
                const screw1 = new THREE.Mesh(screwGeom, matChrome);
                screw1.position.set(0.65, yPos, 1.3);
                servoGroup.add(screw1);
                const screw2 = new THREE.Mesh(screwGeom, matChrome);
                screw2.position.set(-0.65, yPos, 1.3);
                servoGroup.add(screw2);
            });

            // Output Bearing Tower & Spline Shaft (at X=0, Z=1.0)
            const towerGeom = new THREE.CylinderGeometry(0.55, 0.65, 0.3, 20);
            towerGeom.rotateX(Math.PI / 2);
            const tower = new THREE.Mesh(towerGeom, matServoBody);
            tower.position.set(0, -0.15, 1.0);
            servoGroup.add(tower);

            servoGroup.castShadow = true;
            this.scene.add(servoGroup);
            this.servoBases.push(servoGroup);

            // B. Royal Blue 3D-Printed Servo Horn / Arm
            const hornGroup = new THREE.Group();
            const armLen = SimConfig.SERVO_KOL_UZUNLUGU;

            // Output spline hub (Blue printed hub)
            const hubGeom = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 24);
            hubGeom.rotateX(Math.PI / 2);
            const hub = new THREE.Mesh(hubGeom, matRoyalBlue);
            hornGroup.add(hub);

            // Center retaining screw
            const boltGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.35, 12);
            boltGeom.rotateX(Math.PI / 2);
            const bolt = new THREE.Mesh(boltGeom, matChrome);
            bolt.position.set(0, 0.05, 0);
            hornGroup.add(bolt);

            // Main 3D-printed blue arm body (Extends along +X radially)
            const armGeom = new THREE.BoxGeometry(armLen, 0.28, 0.45);
            armGeom.translate(armLen / 2, 0, 0);
            const armMesh = new THREE.Mesh(armGeom, matRoyalBlue);
            hornGroup.add(armMesh);

            // Rounded tip boss on servo arm
            const tipBossGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 16);
            tipBossGeom.rotateX(Math.PI / 2);
            const tipBoss = new THREE.Mesh(tipBossGeom, matRoyalBlue);
            tipBoss.position.set(armLen, 0, 0);
            hornGroup.add(tipBoss);

            // Lower Cyan Rod-End attached to servo arm tip
            const lowerJointGeom = new THREE.BoxGeometry(0.65, 0.55, 0.55);
            const lowerJoint = new THREE.Mesh(lowerJointGeom, matCyanJoint);
            lowerJoint.position.set(armLen, 0.08, 0);
            hornGroup.add(lowerJoint);

            // Chrome pivot pin
            const lowerPinGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.65, 12);
            lowerPinGeom.rotateX(Math.PI / 2);
            const lowerPin = new THREE.Mesh(lowerPinGeom, matChrome);
            lowerPin.position.set(armLen, 0.08, 0);
            hornGroup.add(lowerPin);

            this.scene.add(hornGroup);
            this.servoArms.push(hornGroup);

            // C. Polished Chrome Pushrod / Leg with Cyan Rod-Ends at both tips
            const legGroup = new THREE.Group();
            const L = SimConfig.BACAK_UZUNLUGU;

            // Main Chrome Steel Rod
            const rodGeom = new THREE.CylinderGeometry(0.18, 0.18, L - 2.8, 16);
            const rodMesh = new THREE.Mesh(rodGeom, matPushrod);
            legGroup.add(rodMesh);

            // Cyan Rod-End Sleeves (Top and Bottom)
            [-L / 2 + 0.8, L / 2 - 0.8].forEach(yPos => {
                const sleeveGeom = new THREE.CylinderGeometry(0.34, 0.34, 1.1, 16);
                const sleeve = new THREE.Mesh(sleeveGeom, matCyanJoint);
                sleeve.position.y = yPos;
                legGroup.add(sleeve);
            });

            // Rod-End Ball Joints with chrome eyelet pins
            [-L / 2, L / 2].forEach(yPos => {
                const eyeletGeom = new THREE.SphereGeometry(0.32, 16, 16);
                const eyelet = new THREE.Mesh(eyeletGeom, matCyanJoint);
                eyelet.position.y = yPos;
                legGroup.add(eyelet);

                const ballPinGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.75, 12);
                ballPinGeom.rotateZ(Math.PI / 2);
                const ballPin = new THREE.Mesh(ballPinGeom, matChrome);
                ballPin.position.y = yPos;
                legGroup.add(ballPin);
            });

            this.scene.add(legGroup);
            this.legs.push(legGroup);
        }

        // -------------------------------------------------------------
        // 5. BALL & VISUAL MARKERS
        // -------------------------------------------------------------
        const ballGeom = new THREE.SphereGeometry(1.0, 32, 32); // 1cm radius ball
        this.ball = new THREE.Mesh(ballGeom, materialBall);
        this.ball.castShadow = true;
        this.scene.add(this.ball);

        // Target Marker: High-visibility glowing neon reticle with crosshairs and center dot
        const targetGroup = new THREE.Group();

        // 1. Outer Neon Ring
        const targetGeom = new THREE.RingGeometry(0.5, 0.75, 32);
        const targetMat = new THREE.MeshBasicMaterial({ 
            color: 0x00f0ff, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95,
            depthWrite: false
        });
        const outerRing = new THREE.Mesh(targetGeom, targetMat);
        targetGroup.add(outerRing);

        // 2. Bright Center Dot
        const dotGeom = new THREE.CircleGeometry(0.18, 16);
        const dotMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0,
            depthWrite: false
        });
        const centerDot = new THREE.Mesh(dotGeom, dotMat);
        targetGroup.add(centerDot);

        // 3. 4 Precision Crosshair Lines
        const crossMat = new THREE.LineBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.90,
            depthWrite: false
        });
        const crossGeom = new THREE.BufferGeometry();
        const crossVerts = new Float32Array([
            -1.1, 0, 0,  -0.75, 0, 0,
             0.75, 0, 0,   1.1, 0, 0,
             0, -1.1, 0,   0, -0.75, 0,
             0,  0.75, 0,   0,  1.1, 0
        ]);
        crossGeom.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
        const crosshair = new THREE.LineSegments(crossGeom, crossMat);
        targetGroup.add(crosshair);

        this.targetMarker = targetGroup;
        this.targetMarker.position.set(0, 0, 0.48);
        this.targetMarker.renderOrder = 999;
        this.targetMarker.visible = true;
        this.topPlateGroup.add(this.targetMarker);

        // Trajectory 3D Path Line (Visual path drawn on screen surface)
        const maxTrajPoints = 300;
        const trajPositions = new Float32Array(maxTrajPoints * 3);
        const trajGeom = new THREE.BufferGeometry();
        trajGeom.setAttribute('position', new THREE.BufferAttribute(trajPositions, 3));
        const trajMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            linewidth: 2,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        });
        this.trajectoryLine = new THREE.Line(trajGeom, trajMat);
        this.trajectoryLine.renderOrder = 998;
        this.trajectoryLine.visible = false;
        this.topPlateGroup.add(this.trajectoryLine);

        // Shadow of held ball on screen
        const dropShadowGeom = new THREE.CircleGeometry(1.0, 32);
        const dropShadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        this.dropShadow = new THREE.Mesh(dropShadowGeom, dropShadowMat);
        this.dropShadow.visible = false;
        this.topPlateGroup.add(this.dropShadow);
        
        // Initial kinematics update
        this.updateKinematics(0, 0, 0, SimConfig.Z_YUKSEKLIK);
    }

    updateKinematics(roll, pitch, yaw, height) {
        // Roll & Pitch in degrees, Yaw in degrees (usually 0), height in cm
        const phi = -roll * Math.PI / 180.0;
        const theta = -pitch * Math.PI / 180.0;
        const psi = yaw * Math.PI / 180.0;

        // Apply orientation to top plate group
        this.topPlateGroup.position.set(0, 0, height);
        this.topPlateGroup.rotation.set(phi, theta, psi, 'ZYX');

        // Loop over the 6 legs to calculate servo angles and reposition geometry
        for (let i = 0; i < 6; i++) {
            const baseAngle = this.motorAngles[i];
            const platAngle = this.platformAngles[i];

            // Base joint position
            const bx = SimConfig.TABAN_YARICAPI * Math.cos(baseAngle);
            const by = SimConfig.TABAN_YARICAPI * Math.sin(baseAngle);
            const bz = 0;

            // Platform joint in local coordinate system
            const px = SimConfig.PLATFORM_YARICAPI * Math.cos(platAngle);
            const py = SimConfig.PLATFORM_YARICAPI * Math.sin(platAngle);
            const pz = -0.35; // Lower mounting plane under screen tray

            // Platform joint in global coordinates
            const cP = Math.cos(theta);
            const sP = Math.sin(theta);
            const cR = Math.cos(phi);
            const sR = Math.sin(phi);
            const cY = Math.cos(psi);
            const sY = Math.sin(psi);

            const Px_temp = px * cP + py * sP * sR;
            const Py_temp = py * cR;
            const Pz_temp = -px * sP + py * cP * sR;

            const Px_new = Px_temp * cY - Py_temp * sY;
            const Py_new = Px_temp * sY + Py_temp * cY;
            const Pz_new = Pz_temp + height;

            // Leg vector from base joint to plate joint
            const lx = Px_new - bx;
            const ly = Py_new - by;
            const lz = Pz_new - bz;

            // Rotate leg vector into motor's local frame
            const lx_p = lx * Math.cos(-baseAngle) - ly * Math.sin(-baseAngle);
            const ly_p = lx * Math.sin(-baseAngle) + ly * Math.cos(-baseAngle);
            const lz_p = lz;

            // Effective linkage length squared in plane
            let eff_L2 = SimConfig.BACAK_UZUNLUGU * SimConfig.BACAK_UZUNLUGU - ly_p * ly_p;
            if (eff_L2 < 0) eff_L2 = 0;

            const dist2 = lx_p * lx_p + lz_p * lz_p;
            const arm2 = SimConfig.SERVO_KOL_UZUNLUGU * SimConfig.SERVO_KOL_UZUNLUGU;
            let r = Math.sqrt(dist2);
            if (r < 0.001) r = 0.001;

            let val = (dist2 + arm2 - eff_L2) / (2.0 * SimConfig.SERVO_KOL_UZUNLUGU);
            val = Math.max(-r, Math.min(r, val));

            // Alpha is the servo rotation angle in radians
            const alpha_rad = Math.asin(val / r) - Math.atan2(lx_p, lz_p);
            
            // Calculate servo angle in degrees (90 is home position)
            let servoAngleDeg = 90 + (alpha_rad * 180.0 / Math.PI);
            
            if (i % 2 === 1) {
                servoAngleDeg = 180.0 - servoAngleDeg;
            }
            if (isNaN(servoAngleDeg)) {
                servoAngleDeg = 90;
            }
            servoAngleDeg = Math.max(20, Math.min(160, servoAngleDeg));

            // Position & rotate the Servo Arm (Blue 3D-printed)
            const arm = this.servoArms[i];
            arm.position.set(bx, by, 1.0); // Mounted on top of servo body
            
            // Convert alpha_rad back into global orientation
            arm.rotation.set(0, 0, baseAngle);
            
            // All 6 servo arms point radially outward and lift symmetrically
            const actualAlpha = alpha_rad;
            arm.rotateY(-actualAlpha);

            // Compute global coordinates of the servo arm tip
            const sx_local = SimConfig.SERVO_KOL_UZUNLUGU * Math.cos(actualAlpha);
            const sz_local = SimConfig.SERVO_KOL_UZUNLUGU * Math.sin(actualAlpha);
            
            const sx = bx + sx_local * Math.cos(baseAngle);
            const sy = by + sx_local * Math.sin(baseAngle);
            const sz = 1.0 + sz_local;

            // Position & rotate the Linkage / Leg (Chrome with Cyan rod-ends)
            const leg = this.legs[i];
            const startPt = new THREE.Vector3(sx, sy, sz);
            const endPt = new THREE.Vector3(Px_new, Py_new, Pz_new);
            
            // Position leg cylinder mid-point
            const midPt = new THREE.Vector3().addVectors(startPt, endPt).multiplyScalar(0.5);
            leg.position.copy(midPt);
            
            // Point the cylinder in the direction of the linkage
            const direction = new THREE.Vector3().subVectors(endPt, startPt);
            const length = direction.length();
            direction.normalize();
            
            // Re-scale leg geometry to match exact distance
            leg.scale.set(1, length / SimConfig.BACAK_UZUNLUGU, 1);
            
            // Rotate leg cylinder to align with direction vector
            const alignAxis = new THREE.Vector3(0, 1, 0);
            leg.quaternion.setFromUnitVectors(alignAxis, direction);
        }
    }

    updateBallPosition(x_mm, y_mm) {
        // Update values in state
        this.state.x = x_mm;
        this.state.y = y_mm;
        
        // Position of the ball in local plate coordinate system (convert mm to cm)
        const x_cm = x_mm / 10.0;
        const y_cm = y_mm / 10.0;

        // Visual position: Project ball position from tilted plate coordinate system into world coordinates
        // Ball height is plate thickness (0.3) + screen thickness (0.2) + ball radius (1.0) = 1.5 cm above plate pivot
        const localBallPos = new THREE.Vector3(x_cm, y_cm, 1.5);
        
        // Transform local ball position to global space
        localBallPos.applyMatrix4(this.topPlateGroup.matrixWorld);
        
        // If ball falls off, animate it falling
        if (!this.state.simulated.ballOnPlate && this.state.simulated.y_fall === undefined) {
            this.state.simulated.y_fall = localBallPos.y;
            this.state.simulated.z_fall = localBallPos.z;
            this.state.simulated.fallTime = 0;
        }

        if (this.state.simulated.ballOnPlate) {
            this.ball.position.copy(localBallPos);
            this.ball.rotation.set(0, 0, 0); // Can add visual rolling rotation later if needed
        } else {
            // Animate fall under gravity in world space
            this.state.simulated.fallTime += 0.016;
            const t = this.state.simulated.fallTime;
            const z = this.state.simulated.z_fall - 49.0 * t * t; // fall down (g = 9.8m/s2 => 98cm/s2 => 49 * t^2)
            
            // Continue horizontal speed
            const x = localBallPos.x + (this.state.vx / 10.0) * t;
            const y = localBallPos.y + (this.state.vy / 10.0) * t;
            
            this.ball.position.set(x, y, z);
            
            // Stop rendering below floor
            if (z < -5) {
                this.ball.visible = false;
            }
        }
    }

    updateTargetMarker(x_mm, y_mm) {
        const x_cm = x_mm / 10.0;
        const y_cm = y_mm / 10.0;
        // Float safely above screen surface (0.425) and grid (0.44)
        this.targetMarker.position.set(x_cm, y_cm, 0.48);
        this.targetMarker.visible = true;
    }

    // Set simulator mode target coordinates
    setTarget(x_mm, y_mm) {
        this.state.simulated.targetX = x_mm;
        this.state.simulated.targetY = y_mm;
        this.updateTargetMarker(x_mm, y_mm);
    }

    setTrajectoryPath(points) {
        if (!this.trajectoryLine) return;
        if (!points || points.length === 0) {
            this.trajectoryLine.visible = false;
            return;
        }
        const count = Math.min(points.length, 300);
        const pos = this.trajectoryLine.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
            pos[i * 3 + 0] = points[i].x / 10.0; // mm to cm
            pos[i * 3 + 1] = points[i].y / 10.0;
            pos[i * 3 + 2] = 0.47; // above surface
        }
        this.trajectoryLine.geometry.setDrawRange(0, count);
        this.trajectoryLine.geometry.attributes.position.needsUpdate = true;
        this.trajectoryLine.visible = true;
    }

    clearTrajectoryPath() {
        if (this.trajectoryLine) {
            this.trajectoryLine.visible = false;
        }
    }

    // Apply external force (poke) to ball in simulator mode
    applyDisturbance() {
        if (!this.state.simulated.ballOnPlate) {
            this.resetSimulationBall();
            return;
        }
        // Add random velocity kick (mm/s)
        this.state.simulated.vx += (Math.random() - 0.5) * 500;
        this.state.simulated.vy += (Math.random() - 0.5) * 500;
        
        // Show console feedback
        const consoleEl = document.getElementById('terminal-log');
        if (consoleEl) {
            const line = document.createElement('div');
            line.className = 'terminal-line system-line';
            line.innerText = `[Simülatör] Dış bozucu etki uygulandı! Vx: ${this.state.simulated.vx.toFixed(1)} mm/s, Vy: ${this.state.simulated.vy.toFixed(1)} mm/s`;
            consoleEl.appendChild(line);
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }
    }

    // Kontrolcü hafızasını sıfırla (Arduino'daki ilk_okuma = true davranışı)
    resetControllerMemory() {
        const sim = this.state.simulated;
        sim.x_integral = 0;
        sim.y_integral = 0;
        sim.ilk_okuma = true;
        sim.kontrolBirikim = 0;
    }

    resetSimulationBall() {
        this.state.simulated.x = (Math.random() - 0.5) * (SimConfig.EKRAN_GENISLIK * 0.6);
        this.state.simulated.y = (Math.random() - 0.5) * (SimConfig.EKRAN_YUKSEKLIK * 0.6);
        this.state.simulated.vx = 0;
        this.state.simulated.vy = 0;
        this.resetControllerMemory();
        this.state.simulated.ballOnPlate = true;
        this.state.simulated.y_fall = undefined;
        this.state.simulated.hand.mode = 'none';
        this.dropShadow.visible = false;
        this.ball.visible = true;
        
        const consoleEl = document.getElementById('terminal-log');
        if (consoleEl) {
            const line = document.createElement('div');
            line.className = 'terminal-line system-line';
            line.innerText = `[Simülatör] Top rastgele bir konuma yerleştirildi: (${this.state.simulated.x.toFixed(1)}, ${this.state.simulated.y.toFixed(1)}) mm`;
            consoleEl.appendChild(line);
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }
    }

    // ==========================================================
    // ELLE TUTMA / BIRAKMA (fare ile topu tutup platforma bırakma)
    // ==========================================================
    _logSim(text, cls = 'system-line') {
        const consoleEl = document.getElementById('terminal-log');
        if (!consoleEl) return;
        const line = document.createElement('div');
        line.className = `terminal-line ${cls}`;
        line.innerText = text;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    // Fare ışını topa yeterince yakın mı? (küçük top için geniş tutma alanı)
    isNearBall(raycaster) {
        if (!this.ball.visible) return false;
        return raycaster.ray.distanceToPoint(this.ball.position) < 1.8;
    }

    // Topu ele al
    grabBall(raycaster, nowMs) {
        const sim = this.state.simulated;
        const hand = sim.hand;
        hand.mode = 'held';
        hand.vel.set(0, 0, 0);
        hand.lastPos = null;
        sim.ballOnPlate = false;      // Dokunmatik ekran artık topu görmüyor
        sim.y_fall = undefined;
        this.ball.visible = true;
        this.moveHeldBall(raycaster, nowMs);
        this._logSim('[Simülatör] Top elle tutuldu. Sürükleyin, bırakınca platforma düşecek (tekerlek: yükseklik).');
    }

    // Eldeki topu fare ile taşı: fare platform yüzeyinde topun DÜŞECEĞİ noktayı gösterir,
    // top bu noktanın holdHeight cm üstünde tutulur.
    moveHeldBall(raycaster, nowMs) {
        const hand = this.state.simulated.hand;
        if (hand.mode !== 'held') return;

        const zAim = SimConfig.Z_YUKSEKLIK + 0.4; // ekran yüzeyi seviyesi
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zAim);
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, hit)) return;

        // Sahneden çok uzaklaşmasın
        hit.x = Math.max(-25, Math.min(25, hit.x));
        hit.y = Math.max(-25, Math.min(25, hit.y));

        this.topPlateGroup.updateMatrixWorld();
        const local = this.topPlateGroup.worldToLocal(hit.clone());
        local.z = 1.5 + hand.holdHeight;

        // El hızı (fırlatma için), yumuşatılmış
        if (hand.lastPos && nowMs > hand.lastT) {
            const dtm = (nowMs - hand.lastT) / 1000.0;
            const inst = local.clone().sub(hand.lastPos).divideScalar(dtm);
            inst.z = 0;
            hand.vel.multiplyScalar(0.6).add(inst.multiplyScalar(0.4));
            if (hand.vel.length() > 150) hand.vel.setLength(150);
        }
        hand.lastPos = local.clone();
        hand.lastT = nowMs;
        hand.pos.copy(local);
    }

    // Topu bırak -> serbest düşüş
    releaseBall() {
        const hand = this.state.simulated.hand;
        if (hand.mode !== 'held') return;
        // Fare bir süredir durduysa top "bırakılır", fırlatılmaz
        if (performance.now() - hand.lastT > 80) hand.vel.set(0, 0, 0);
        hand.vel.z = 0;
        hand.mode = 'dropping';
        this._logSim(`[Simülatör] Top ${hand.holdHeight.toFixed(0)} cm yükseklikten bırakıldı.`);
    }

    adjustHoldHeight(deltaCm) {
        const hand = this.state.simulated.hand;
        hand.holdHeight = Math.max(2, Math.min(15, hand.holdHeight + deltaCm));
        hand.pos.z = 1.5 + hand.holdHeight;
    }

    // Top platformda değilken platform yavaşça yataya döner
    _levelPlatform(dt) {
        const sim = this.state.simulated;
        sim.kontrolBirikim += dt;
        while (sim.kontrolBirikim >= SimConfig.KONTROL_PERIYODU) {
            sim.kontrolBirikim -= SimConfig.KONTROL_PERIYODU;
            sim.roll = this.adimSinirla(0, sim.roll, SimConfig.MAX_EGIM_ADIM);
            sim.pitch = this.adimSinirla(0, sim.pitch, SimConfig.MAX_EGIM_ADIM);
        }
    }

    _handPhysics(dt) {
        const sim = this.state.simulated;
        const hand = sim.hand;
        const g = 981.0; // cm/s^2
        const boundX = SimConfig.EKRAN_GENISLIK / 20.0;   // cm
        const boundY = SimConfig.EKRAN_YUKSEKLIK / 20.0;  // cm
        const restZ = 1.5; // top merkezi, plaka yerel ekseninde ekran üstünde

        if (hand.mode === 'dropping') {
            hand.vel.z -= g * dt;
            hand.pos.addScaledVector(hand.vel, dt);

            const onScreen = Math.abs(hand.pos.x) <= boundX && Math.abs(hand.pos.y) <= boundY;
            if (hand.pos.z <= restZ) {
                if (onScreen) {
                    hand.pos.z = restZ;
                    if (hand.vel.z < -40) {
                        // Küçük sekme
                        hand.vel.z = -hand.vel.z * 0.35;
                        hand.vel.x *= 0.8;
                        hand.vel.y *= 0.8;
                    } else {
                        this._landOnPlate();
                    }
                } else {
                    // Platformu ıskaladı -> yere düşüyor (dünya koordinatına geç)
                    this.topPlateGroup.updateMatrixWorld();
                    hand.pos.copy(this.topPlateGroup.localToWorld(hand.pos.clone()));
                    hand.mode = 'floor';
                    hand.landedLogged = false;
                }
            }
        } else if (hand.mode === 'floor') {
            hand.vel.z -= g * dt;
            hand.pos.addScaledVector(hand.vel, dt);
            const r = Math.hypot(hand.pos.x, hand.pos.y);
            const floorZ = (r < SimConfig.TABAN_YARICAPI + 1.2) ? 1.3 : 0.0; // taban plakası veya zemin
            if (hand.pos.z <= floorZ) {
                hand.pos.z = floorZ;
                if (hand.vel.z < -60) {
                    hand.vel.z = -hand.vel.z * 0.4;
                } else {
                    hand.vel.z = 0;
                }
                hand.vel.x *= (1.0 - 2.0 * dt);
                hand.vel.y *= (1.0 - 2.0 * dt);
                if (!hand.landedLogged) {
                    hand.landedLogged = true;
                    this._logSim('[Simülatör UYARI] Top platformu ıskaladı ve yere düştü. Topu tekrar tutup bırakabilirsiniz.', 'error-line');
                }
            }
        }
    }

    _landOnPlate() {
        const sim = this.state.simulated;
        const hand = sim.hand;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        sim.x = hand.pos.x * 10.0;
        sim.y = hand.pos.y * 10.0;
        sim.vx = clamp(hand.vel.x * 10.0, -300, 300);
        sim.vy = clamp(hand.vel.y * 10.0, -300, 300);
        sim.ballOnPlate = true;
        sim.y_fall = undefined;
        hand.mode = 'none';
        this.dropShadow.visible = false;
        this.resetControllerMemory(); // Arduino'daki ilk_okuma davranışı
        this._logSim(`[Simülatör] Top platforma düştü: (${sim.x.toFixed(1)}, ${sim.y.toFixed(1)}) mm — kontrolcü devrede.`);
    }

    // Elde / düşen / yerdeki topun güncellemesi (her kare)
    updateHand(dt) {
        const hand = this.state.simulated.hand;

        // El durduğunda fırlatma hızı söner
        if (hand.mode === 'held' && performance.now() - hand.lastT > 50) {
            hand.vel.multiplyScalar(0.8);
        }

        if (hand.mode === 'held' || hand.mode === 'dropping') {
            this._levelPlatform(dt);
        }

        if (hand.mode === 'dropping' || hand.mode === 'floor') {
            const n = Math.max(1, Math.ceil(dt / 0.002));
            for (let i = 0; i < n; i++) this._handPhysics(dt / n);
        }
    }

    updateHeldBallVisual() {
        const hand = this.state.simulated.hand;
        if (hand.mode === 'none') return;

        this.topPlateGroup.updateMatrixWorld();
        if (hand.mode === 'floor') {
            this.ball.position.copy(hand.pos);
            this.dropShadow.visible = false;
            return;
        }

        this.ball.position.copy(this.topPlateGroup.localToWorld(hand.pos.clone()));

        // Düşeceği noktayı gösteren gölge
        const boundX = SimConfig.EKRAN_GENISLIK / 20.0;
        const boundY = SimConfig.EKRAN_YUKSEKLIK / 20.0;
        const onScreen = Math.abs(hand.pos.x) <= boundX && Math.abs(hand.pos.y) <= boundY;
        this.dropShadow.visible = onScreen;
        if (onScreen) {
            const h = Math.max(0, hand.pos.z - 1.5);
            const s = 1.0 / (1.0 + h * 0.06);
            this.dropShadow.position.set(hand.pos.x, hand.pos.y, 0.43);
            this.dropShadow.scale.set(s, s, 1);
            this.dropShadow.material.opacity = 0.55 * s;
        }
    }

    // Physics Engine Loop for Simulated (Offline) Mode
    stepSimulation(dt) {
        if (!this.state.simulated.ballOnPlate) return;

        const sim = this.state.simulated;
        
        // Gravity (mm/s^2)
        const g = 9810.0;

        // Kontrolcünün ürettiği Roll/Pitch komutunu ekran eksenlerindeki eğime çevir.
        // (Arduino'daki eksen değiştirme / ters çevirme / 45° karışım geri alınır.)
        const egim = this.kontrolToEkranEgim(sim.roll, sim.pitch);

        // Eğik düzlemde yuvarlanan dolu küre: a = (5/7) * g * sin(eğim)
        // Eksi işaret: pozitif eğim komutu topu hatanın tersine (hedefe doğru) iter.
        const k = SimConfig.YUVARLANMA_KATSAYISI;
        const ax = -k * g * Math.sin(egim.x * Math.PI / 180.0);
        const ay = -k * g * Math.sin(egim.y * Math.PI / 180.0);
        
        // Update Ball Velocity
        sim.vx += ax * dt;
        sim.vy += ay * dt;
        
        // Apply rolling friction/damping (drag coefficient)
        const friction = SimConfig.SURTUNME;
        sim.vx *= (1.0 - friction * dt);
        sim.vy *= (1.0 - friction * dt);
        
        // Update Position
        sim.x += sim.vx * dt;
        sim.y += sim.vy * dt;

        // Check if ball fell off the physical touchscreen plate boundaries
        // EKRAN_GENISLIK and EKRAN_YUKSEKLIK are total dimensions, so bounds are half values.
        const boundX = SimConfig.EKRAN_GENISLIK / 2.0;
        const boundY = SimConfig.EKRAN_YUKSEKLIK / 2.0;

        if (Math.abs(sim.x) > boundX + 8 || Math.abs(sim.y) > boundY + 8) {
            sim.ballOnPlate = false;
            
            // Console warning
            const consoleEl = document.getElementById('terminal-log');
            if (consoleEl) {
                const line = document.createElement('div');
                line.className = 'terminal-line error-line';
                line.innerText = `[Simülatör UYARI] Top platform dışına düştü! Sıfırlamak için "Sıfırla" butonuna basın veya plakaya tıklayıp yeni topu tutup bırakın.`;
                consoleEl.appendChild(line);
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }
            return;
        }

        // ==========================================
        // SIMULATED PID LOOP (ESP32 loop() ile birebir)
        // Kontrolcü her tarayıcı karesinde değil, Arduino gibi sabit
        // periyotla (KONTROL_PERIYODU) çalışır.
        // ==========================================
        sim.kontrolBirikim += dt;
        while (sim.kontrolBirikim >= SimConfig.KONTROL_PERIYODU) {
            sim.kontrolBirikim -= SimConfig.KONTROL_PERIYODU;
            this.kontrolAdimi(SimConfig.KONTROL_PERIYODU);
        }
    }

    // Arduino loop() içindeki PID adımının JavaScript karşılığı
    kontrolAdimi(dt) {
        const sim = this.state.simulated;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

        // 1. Ölçüm: topun ekran konumu -> kontrol ekseni (ekranKonumOku() dönüşümü)
        const olcum = this.ekranToKontrol(sim.x, sim.y);
        const hedef = this.ekranToKontrol(sim.targetX, sim.targetY);

        // 2. Konum filtresi (FILTRE_YENI_ORAN)
        if (sim.ilk_okuma) {
            sim.x_filtre = olcum.x;
            sim.y_filtre = olcum.y;
            sim.x_onceki = sim.x_filtre;
            sim.y_onceki = sim.y_filtre;
            sim.x_integral = 0;
            sim.y_integral = 0;
            sim.ilk_okuma = false;
        } else {
            const r = SimConfig.FILTRE_YENI_ORAN;
            sim.x_filtre = (1.0 - r) * sim.x_filtre + r * olcum.x;
            sim.y_filtre = (1.0 - r) * sim.y_filtre + r * olcum.y;
        }

        // 3. Ölü bant (hedefe göre hata üzerinde)
        const hataX = sim.x_filtre - hedef.x;
        const hataY = sim.y_filtre - hedef.y;
        const x_kontrol = (Math.abs(hataX) < SimConfig.DEAD_BAND) ? 0 : hataX;
        const y_kontrol = (Math.abs(hataY) < SimConfig.DEAD_BAND) ? 0 : hataY;

        // 4. Hız (D kısmı) — filtrelenmiş konumdan türetilir, filtre gecikmesi korunur
        const x_hiz = clamp((sim.x_filtre - sim.x_onceki) / dt, -SimConfig.HIZ_LIMIT, SimConfig.HIZ_LIMIT);
        const y_hiz = clamp((sim.y_filtre - sim.y_onceki) / dt, -SimConfig.HIZ_LIMIT, SimConfig.HIZ_LIMIT);
        sim.x_onceki = sim.x_filtre;
        sim.y_onceki = sim.y_filtre;

        // 5. İntegral
        sim.x_integral = clamp(sim.x_integral + x_kontrol * dt, -SimConfig.INTEGRAL_LIMIT, SimConfig.INTEGRAL_LIMIT);
        sim.y_integral = clamp(sim.y_integral + y_kontrol * dt, -SimConfig.INTEGRAL_LIMIT, SimConfig.INTEGRAL_LIMIT);

        // 6. PID çıkışı
        const pid_x = (sim.kp * x_kontrol) + (sim.kd * x_hiz) + (sim.ki * sim.x_integral);
        const pid_y = (sim.kp * y_kontrol) + (sim.kd * y_hiz) + (sim.ki * sim.y_integral);

        // 7. Arduino'daki yön mantığı + sınırlar
        let pitch = clamp(-pid_x, -SimConfig.MAX_EGIM, SimConfig.MAX_EGIM);
        let roll = clamp(pid_y, -SimConfig.MAX_EGIM, SimConfig.MAX_EGIM);

        sim.pitch = this.adimSinirla(pitch, sim.pitch, SimConfig.MAX_EGIM_ADIM);
        sim.roll = this.adimSinirla(roll, sim.roll, SimConfig.MAX_EGIM_ADIM);
    }

    // Ekran koordinatı (mm) -> kontrol ekseni (Arduino ekranKonumOku() ile aynı)
    ekranToKontrol(x_c, y_c) {
        let x = (x_c * ROT_A) - (y_c * ROT_B);
        let y = -(x_c * ROT_A) - (y_c * ROT_B);
        if (SimConfig.EKSEN_DEGISTIR) { const t = x; x = y; y = t; }
        if (SimConfig.X_TERS) x = -x;
        if (SimConfig.Y_TERS) y = -y;
        return { x, y };
    }

    // Kontrol ekseni (x_hesap, y_hesap) -> ekran koordinatı (mm) — tam ters dönüşüm
    kontrolToEkran(x_h, y_h) {
        let x = x_h, y = y_h;
        if (SimConfig.X_TERS) x = -x;
        if (SimConfig.Y_TERS) y = -y;
        if (SimConfig.EKSEN_DEGISTIR) { const t = x; x = y; y = t; }
        return {
            x: (x - y) / (2.0 * ROT_A),
            y: -(x + y) / (2.0 * ROT_B)
        };
    }

    // Roll/Pitch komutunu (derece) ekran eksenlerindeki eğime (derece) çevirir.
    // Dönüşüm ölçeksiz kısmı (eksen değiştirme, işaret, 45° karışım) geri alır; ortogonal
    // olduğu için eğim büyüklüğü korunur. Varsayım: gerçek platformda servo yönleri doğru,
    // yani kontrolcü topu her zaman hedefe doğru iter.
    kontrolToEkranEgim(roll, pitch) {
        let ux = -pitch;   // pitch = -pid_x
        let uy = roll;     // roll  =  pid_y
        if (SimConfig.X_TERS) ux = -ux;
        if (SimConfig.Y_TERS) uy = -uy;
        if (SimConfig.EKSEN_DEGISTIR) { const t = ux; ux = uy; uy = t; }
        return {
            x: (ux - uy) / Math.SQRT2,
            y: -(ux + uy) / Math.SQRT2
        };
    }

    // 3D çizim için plakanın görsel eğimi: top ekranda hangi yöne ivmeleniyorsa
    // plaka o yöne doğru alçalmış görünür.
    gorselEgim(roll, pitch) {
        const e = this.kontrolToEkranEgim(roll, pitch);
        return { roll: -e.y, pitch: e.x };
    }

    adimSinirla(hedef, onceki, maxAdim) {
        if (hedef > onceki + maxAdim) return onceki + maxAdim;
        if (hedef < onceki - maxAdim) return onceki - maxAdim;
        return hedef;
    }

    animate(currentTime = 0) {
        requestAnimationFrame((t) => this.animate(t));

        // Calculate delta time
        if (!this.state.simulated.lastTime) this.state.simulated.lastTime = currentTime;
        let dt = (currentTime - this.state.simulated.lastTime) / 1000.0;
        this.state.simulated.lastTime = currentTime;

        // Prevent erratic jumps (limit dt window) — uzun kareler kırpılır, alt adımlarla işlenir
        if (dt < 0.0) dt = 0.0;
        if (dt > 0.1) dt = 0.1;

        // If in simulation mode, update local physics & control loop
        if (window.currentMode === 'simulator') {
            const hand = this.state.simulated.hand;
            if (hand.mode === 'none') {
                // Fizik entegrasyonu en fazla 2 ms'lik alt adımlarla
                const altAdim = Math.max(1, Math.ceil(dt / 0.002));
                for (let s = 0; s < altAdim; s++) {
                    this.stepSimulation(dt / altAdim);
                }
            } else {
                // Top elde / düşüyor / yerde
                this.updateHand(dt);
            }
            
            // Set main state to sim state for visualization
            this.state.x = this.state.simulated.x;
            this.state.y = this.state.simulated.y;
            this.state.vx = this.state.simulated.vx;
            this.state.vy = this.state.simulated.vy;
            this.state.roll = this.state.simulated.roll;
            this.state.pitch = this.state.simulated.pitch;
            
            // Update 3D kinematics and ball (plaka, topun ivmelendiği yöne eğik çizilir)
            const gorsel = this.gorselEgim(this.state.roll, this.state.pitch);
            this.updateKinematics(gorsel.roll, gorsel.pitch, 0, SimConfig.Z_YUKSEKLIK);
            if (hand.mode === 'none') {
                this.updateBallPosition(this.state.x, this.state.y);
            } else {
                this.updateHeldBallVisual();
            }
            
            // Update metric text overlays in dashboard (throttled)
            if (Math.random() < 0.2) {
                document.getElementById('lbl-pos-x').innerHTML = `${this.state.x.toFixed(1)} <span class="unit">mm</span>`;
                document.getElementById('lbl-pos-y').innerHTML = `${this.state.y.toFixed(1)} <span class="unit">mm</span>`;
                document.getElementById('lbl-pitch').innerHTML = `${this.state.pitch.toFixed(2)} <span class="unit">°</span>`;
                document.getElementById('lbl-roll').innerHTML = `${this.state.roll.toFixed(2)} <span class="unit">°</span>`;
            }
        }

        // Render scene
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
}
