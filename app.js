// Stewart Platform (Ball & Plate) Simulator - Application Controller

// Global App State
window.currentMode = 'serial'; // 'serial' or 'simulator'

class AppController {
    constructor() {
        // Core components
        this.simulator = new StewartSimulator('canvas-container');
        this.charts = new StewartCharts();
        
        // Serial Port objects
        this.port = null;
        this.reader = null;
        this.readLoopActive = false;
        
        // Frequency limiting for UI updates
        this.lastChartUpdateTime = 0;
        this.chartIntervalMs = 50; // update charts at 20Hz max for rendering performance
        
        // DOM Elements
        this.elements = {
            btnModeSerial: document.getElementById('btn-mode-serial'),
            btnModeSim: document.getElementById('btn-mode-sim'),
            serialControls: document.getElementById('serial-controls'),
            simControls: document.getElementById('sim-controls'),
            panelTarget: document.getElementById('panel-target'),
            panelTrajectory: document.getElementById('panel-trajectory'),
            padCanvas: document.getElementById('pad-canvas'),
            padInfo: document.getElementById('pad-info'),
            btnShapeCircle: document.getElementById('btn-shape-circle'),
            btnShapeTriangle: document.getElementById('btn-shape-triangle'),
            btnShapeSquare: document.getElementById('btn-shape-square'),
            btnShapeInfinity: document.getElementById('btn-shape-infinity'),
            btnTrajPlay: document.getElementById('btn-traj-play'),
            btnTrajClear: document.getElementById('btn-traj-clear'),
            sliderTrajSpeed: document.getElementById('slider-traj-speed'),
            valTrajSpeed: document.getElementById('val-traj-speed'),
            btnConnect: document.getElementById('btn-connect'),
            btnSimReset: document.getElementById('btn-sim-reset'),
            btnSimDisturbance: document.getElementById('btn-sim-disturbance'),
            baudrate: document.getElementById('baudrate'),
            statusBadge: document.getElementById('status-badge'),
            
            // Slider elements
            sliderKp: document.getElementById('slider-kp'),
            sliderKd: document.getElementById('slider-kd'),
            sliderKi: document.getElementById('slider-ki'),
            valKp: document.getElementById('val-kp'),
            valKd: document.getElementById('val-kd'),
            valKi: document.getElementById('val-ki'),
            lblPidSource: document.getElementById('lbl-pid-source'),
            pidNote: document.getElementById('pid-note'),
            
            sliderTargetX: document.getElementById('slider-target-x'),
            sliderTargetY: document.getElementById('slider-target-y'),
            valTargetX: document.getElementById('val-target-x'),
            valTargetY: document.getElementById('val-target-y'),
            
            // Stats
            lblPosX: document.getElementById('lbl-pos-x'),
            lblPosY: document.getElementById('lbl-pos-y'),
            lblPitch: document.getElementById('lbl-pitch'),
            lblRoll: document.getElementById('lbl-roll'),
            
            // Chart selectors
            btnChartPos: document.getElementById('btn-chart-pos'),
            btnChartVel: document.getElementById('btn-chart-vel'),
            btnChartAngles: document.getElementById('btn-chart-angles'),
            containerPosChart: document.getElementById('container-pos-chart'),
            containerVelChart: document.getElementById('container-vel-chart'),
            containerAnglesChart: document.getElementById('container-angles-chart'),
            
            // Terminal
            terminalLog: document.getElementById('terminal-log'),
            terminalToggle: document.getElementById('terminal-toggle'),
            terminalChevron: document.getElementById('terminal-chevron'),
            btnClearTerminal: document.getElementById('btn-clear-terminal')
        };
        
        this.initEvents();
        this.checkWebSerialSupport();
    }

    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.logToTerminal('Tarayıcınız Web Serial API desteklemiyor. Lütfen Google Chrome veya Microsoft Edge kullanın.', 'error');
            this.elements.btnConnect.disabled = true;
            this.elements.btnConnect.innerText = 'Seri Port Desteklenmiyor';
            
            // Force simulator mode as only option
            this.switchMode('simulator');
            this.elements.btnModeSerial.style.display = 'none';
        }
    }

    initEvents() {
        // Mode Switches
        this.elements.btnModeSerial.addEventListener('click', () => this.switchMode('serial'));
        this.elements.btnModeSim.addEventListener('click', () => this.switchMode('simulator'));

        // Serial Connection
        this.elements.btnConnect.addEventListener('click', () => this.toggleSerialConnection());

        // Simulator interactions
        this.elements.btnSimReset.addEventListener('click', () => this.simulator.resetSimulationBall());
        this.elements.btnSimDisturbance.addEventListener('click', () => this.simulator.applyDisturbance());

        // PID Slider adjustments (Simulator mode only)
        const updatePid = () => {
            const kp = parseFloat(this.elements.sliderKp.value);
            const kd = parseFloat(this.elements.sliderKd.value);
            const ki = parseFloat(this.elements.sliderKi.value);
            
            this.elements.valKp.innerText = kp.toFixed(3);
            this.elements.valKd.innerText = kd.toFixed(3);
            this.elements.valKi.innerText = ki.toFixed(4);
            
            this.simulator.state.simulated.kp = kp;
            this.simulator.state.simulated.kd = kd;
            this.simulator.state.simulated.ki = ki;
        };

        this.elements.sliderKp.addEventListener('input', updatePid);
        this.elements.sliderKd.addEventListener('input', updatePid);
        this.elements.sliderKi.addEventListener('input', updatePid);

        // Target sliders adjustment
        const updateTarget = () => {
            const tx = parseInt(this.elements.sliderTargetX.value);
            const ty = parseInt(this.elements.sliderTargetY.value);
            this.elements.valTargetX.innerText = tx;
            this.elements.valTargetY.innerText = ty;
            this.simulator.setTarget(tx, ty);
        };
        this.elements.sliderTargetX.addEventListener('input', updateTarget);
        this.elements.sliderTargetY.addEventListener('input', updateTarget);

        // Charts toggle buttons
        const showChart = (chartType) => {
            this.elements.btnChartPos.classList.remove('active');
            this.elements.btnChartVel.classList.remove('active');
            this.elements.btnChartAngles.classList.remove('active');

            this.elements.containerPosChart.classList.add('hidden');
            this.elements.containerVelChart.classList.add('hidden');
            this.elements.containerAnglesChart.classList.add('hidden');

            if (chartType === 'pos') {
                this.elements.btnChartPos.classList.add('active');
                this.elements.containerPosChart.classList.remove('hidden');
            } else if (chartType === 'vel') {
                this.elements.btnChartVel.classList.add('active');
                this.elements.containerVelChart.classList.remove('hidden');
            } else if (chartType === 'angles') {
                this.elements.btnChartAngles.classList.add('active');
                this.elements.containerAnglesChart.classList.remove('hidden');
            }
        };

        this.elements.btnChartPos.addEventListener('click', () => showChart('pos'));
        this.elements.btnChartVel.addEventListener('click', () => showChart('vel'));
        this.elements.btnChartAngles.addEventListener('click', () => showChart('angles'));

        // Collapsible terminal log
        this.elements.terminalToggle.addEventListener('click', (e) => {
            // Prevent toggling when clicking the clear button
            if (e.target.closest('#btn-clear-terminal')) return;
            
            const isCollapsed = this.elements.terminalLog.classList.toggle('collapsed');
            this.elements.terminalChevron.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        });

        this.elements.btnClearTerminal.addEventListener('click', () => {
            this.elements.terminalLog.innerHTML = '';
        });

        // 3D View Mouse Interaction for Simulator
        //  - Topu sol tıkla tut, sürükle, bırak  -> top platforma düşer
        //  - Tutarken fare tekerleği                -> tutma yüksekliği
        //  - Top düşmüş/kaybolmuşsa plakaya tıkla   -> yeni top ele alınır
        //  - Plakaya çift tık                       -> topu oraya anında koy
        const canvasContainer = document.getElementById('canvas-container');
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let dragging = false;

        const setRay = (event) => {
            const rect = this.simulator.renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, this.simulator.camera);
            return raycaster;
        };

        // Capture aşaması: OrbitControls'tan önce yakalanır, top tutulursa kamera dönmez
        canvasContainer.addEventListener('pointerdown', (event) => {
            if (window.currentMode !== 'simulator') return;
            if (event.button !== 0) return;

            const sim = this.simulator;
            const ray = setRay(event);
            let grab = sim.isNearBall(ray);

            // Top görünmüyorsa (platformdan düşüp kaybolduysa) plakaya tıklayınca yeni top ele alınır
            if (!grab && !sim.ball.visible) {
                grab = ray.intersectObject(sim.topPlate).length > 0;
            }
            if (!grab) return; // Normal kamera kontrolü

            event.preventDefault();
            event.stopPropagation();
            dragging = true;
            sim.controls.enabled = false;
            canvasContainer.style.cursor = 'grabbing';
            sim.grabBall(ray, performance.now());
        }, true);

        window.addEventListener('pointermove', (event) => {
            if (window.currentMode !== 'simulator') return;
            if (dragging) {
                this.simulator.moveHeldBall(setRay(event), performance.now());
                return;
            }
            // Fare topun üzerindeyse "tut" imleci
            if (canvasContainer.contains(event.target)) {
                canvasContainer.style.cursor = this.simulator.isNearBall(setRay(event)) ? 'grab' : '';
            }
        });

        window.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            this.simulator.releaseBall();
            this.simulator.controls.enabled = true;
            canvasContainer.style.cursor = '';
        });

        // Tutarken tekerlek: yüksekliği ayarla (zoom yerine)
        canvasContainer.addEventListener('wheel', (event) => {
            if (!dragging) return;
            event.preventDefault();
            event.stopPropagation();
            this.simulator.adjustHoldHeight(event.deltaY < 0 ? 1 : -1);
        }, { capture: true, passive: false });

        // Çift tık: topu tıklanan noktaya anında yerleştir
        canvasContainer.addEventListener('dblclick', (event) => {
            if (window.currentMode !== 'simulator' || dragging) return;
            const sim = this.simulator;
            if (sim.state.simulated.hand.mode === 'dropping') return;
            const intersects = setRay(event).intersectObject(sim.topPlate);
            if (intersects.length === 0) return;

            const localIntersect = sim.topPlate.worldToLocal(intersects[0].point.clone());
            const targetX_mm = localIntersect.x * 10.0;
            const targetY_mm = localIntersect.y * 10.0;

            sim.state.simulated.x = targetX_mm;
            sim.state.simulated.y = targetY_mm;
            sim.state.simulated.vx = 0;
            sim.state.simulated.vy = 0;
            sim.state.simulated.ballOnPlate = true;
            sim.state.simulated.y_fall = undefined;
            sim.state.simulated.hand.mode = 'none';
            sim.dropShadow.visible = false;
            sim.resetControllerMemory(); // Top kaldırılıp bırakılmış gibi (ilk_okuma)
            sim.ball.visible = true;

            this.logToTerminal(`[Simülatör] Top yeni konuma yerleştirildi: (${targetX_mm.toFixed(1)}, ${targetY_mm.toFixed(1)}) mm`);
        });

        // Initialize 2D Trajectory Drawing Pad & Shape Follower
        this.initTrajectorySystem();
    }

    switchMode(mode) {
        if (mode === window.currentMode) return;
        
        window.currentMode = mode;
        this.charts.clear();

        if (mode === 'serial') {
            this.elements.btnModeSerial.classList.add('active');
            this.elements.btnModeSim.classList.remove('active');
            
            this.elements.serialControls.classList.remove('hidden');
            this.elements.simControls.classList.add('hidden');
            this.elements.panelTarget.classList.add('hidden');
            if (this.elements.panelTrajectory) this.elements.panelTrajectory.classList.add('hidden');
            
            this.elements.sliderKp.disabled = true;
            this.elements.sliderKd.disabled = true;
            this.elements.sliderKi.disabled = true;
            
            this.elements.lblPidSource.innerText = 'Donanım';
            this.elements.lblPidSource.className = 'badge';
            
            this.elements.pidNote.innerHTML = `
                <i data-lucide="info"></i>
                <span>Katsayılar donanım modunda Arduino kodundaki sabitlerden okunur. Düzenlemek için Simülatör moduna geçin.</span>
            `;
            lucide.createIcons();

            this.simulator.targetMarker.visible = false;
            
            if (this.port && this.port.readable) {
                this.updateStatusBadge('connected');
            } else {
                this.updateStatusBadge('disconnected');
            }
            
            this.logToTerminal('[Sistem] Seri Port moduna geçildi. Donanım verisi bekleniyor...', 'system');
        } else {
            this.elements.btnModeSerial.classList.remove('active');
            this.elements.btnModeSim.classList.add('active');
            
            this.elements.serialControls.classList.add('hidden');
            this.elements.simControls.classList.remove('hidden');
            this.elements.panelTarget.classList.remove('hidden');
            if (this.elements.panelTrajectory) this.elements.panelTrajectory.classList.remove('hidden');
            
            this.elements.sliderKp.disabled = false;
            this.elements.sliderKd.disabled = false;
            this.elements.sliderKi.disabled = false;
            
            this.elements.lblPidSource.innerText = 'Ayarlanabilir';
            this.elements.lblPidSource.className = 'badge simulator-badge';
            
            this.elements.pidNote.innerHTML = `
                <i data-lucide="info"></i>
                <span>Sürgüler yardımıyla PID parametrelerini anlık değiştirebilirsiniz. 3D ekrana tıklayarak topu istediğiniz konuma bırakabilirsiniz.</span>
            `;
            lucide.createIcons();

            this.simulator.targetMarker.visible = true;
            this.updateStatusBadge('simulator');
            
            // Reset simulation metrics
            this.simulator.resetSimulationBall();
            
            this.logToTerminal('[Sistem] Çevrimdışı Simülasyon moduna geçildi.', 'system');
        }
    }

    updateStatusBadge(state) {
        this.elements.statusBadge.className = 'status-indicator ' + state;
        if (state === 'disconnected') {
            this.elements.statusBadge.innerText = 'Bağlantı Yok';
        } else if (state === 'connected') {
            this.elements.statusBadge.innerText = 'Bağlandı';
        } else if (state === 'simulator') {
            this.elements.statusBadge.innerText = 'Simülatör Aktif';
        }
    }

    // ==========================================================
    // TRAJECTORY DRAWING PAD & SHAPE FOLLOWING SYSTEM
    // ==========================================================
    initTrajectorySystem() {
        this.trajectory = {
            points: [],
            distances: [],
            totalLength: 0,
            isPlaying: false,
            progress: 0,
            speed: 35, // mm/s
            activeShape: null,
            isDrawing: false
        };

        const canvas = this.elements.padCanvas;
        if (!canvas) return;
        this.padCtx = canvas.getContext('2d');

        const eventToMm = (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = canvas.width / rect.width;
            const sy = canvas.height / rect.height;
            const cx = (e.clientX - rect.left) * sx;
            const cy = (e.clientY - rect.top) * sy;
            return {
                x: Math.max(-110, Math.min(110, cx - 111)),
                y: Math.max(-64, Math.min(64, 65 - cy))
            };
        };

        // Pointer drawing events
        canvas.addEventListener('pointerdown', (e) => {
            if (window.currentMode !== 'simulator') return;
            e.preventDefault();
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

            this.trajectory.isPlaying = false;
            this.updatePlayButtonVisual();
            const pt = eventToMm(e);
            this.trajectory.points = [pt];
            this.trajectory.activeShape = 'custom';
            this.trajectory.isDrawing = true;
            this.elements.padInfo.innerText = 'Çiziliyor...';
            this.clearActiveShapeButtons();

            // Also immediately update target marker to this tapped point
            this.simulator.setTarget(pt.x, pt.y);
            this.elements.sliderTargetX.value = Math.round(pt.x);
            this.elements.sliderTargetY.value = Math.round(pt.y);
            this.elements.valTargetX.innerText = Math.round(pt.x);
            this.elements.valTargetY.innerText = Math.round(pt.y);

            this.renderPad();
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!this.trajectory.isDrawing) return;
            const pt = eventToMm(e);
            const pts = this.trajectory.points;
            const last = pts[pts.length - 1];
            if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 3.0) {
                pts.push(pt);
                this.updateTrajectoryDistances();
                this.simulator.setTrajectoryPath(pts);
                this.simulator.setTarget(pt.x, pt.y);
                this.elements.sliderTargetX.value = Math.round(pt.x);
                this.elements.sliderTargetY.value = Math.round(pt.y);
                this.elements.valTargetX.innerText = Math.round(pt.x);
                this.elements.valTargetY.innerText = Math.round(pt.y);
                this.renderPad();
            }
        });

        const stopDrawing = () => {
            if (!this.trajectory.isDrawing) return;
            this.trajectory.isDrawing = false;
            const pts = this.trajectory.points;
            if (pts.length > 2) {
                const first = pts[0];
                const last = pts[pts.length - 1];
                if (Math.hypot(first.x - last.x, first.y - last.y) < 25) {
                    pts.push({ x: first.x, y: first.y });
                }
                this.updateTrajectoryDistances();
                this.simulator.setTrajectoryPath(pts);
                this.elements.padInfo.innerText = `Özel Yörünge: ${pts.length} nokta (${this.trajectory.totalLength.toFixed(0)} mm)`;
                this.logToTerminal(`[Yörünge] Yeni serbest çizim tamamlandı (${this.trajectory.totalLength.toFixed(0)} mm). "Takip Başlat" ile izleyebilirsiniz.`);
            } else if (pts.length === 1) {
                this.elements.padInfo.innerText = `Hedef: (${pts[0].x.toFixed(1)}, ${pts[0].y.toFixed(1)}) mm`;
            }
            this.renderPad();
        };

        canvas.addEventListener('pointerup', stopDrawing);
        canvas.addEventListener('pointercancel', stopDrawing);

        // Preset buttons
        if (this.elements.btnShapeCircle) this.elements.btnShapeCircle.addEventListener('click', () => this.generatePresetShape('circle'));
        if (this.elements.btnShapeTriangle) this.elements.btnShapeTriangle.addEventListener('click', () => this.generatePresetShape('triangle'));
        if (this.elements.btnShapeSquare) this.elements.btnShapeSquare.addEventListener('click', () => this.generatePresetShape('square'));
        if (this.elements.btnShapeInfinity) this.elements.btnShapeInfinity.addEventListener('click', () => this.generatePresetShape('infinity'));

        // Play / Pause
        if (this.elements.btnTrajPlay) {
            this.elements.btnTrajPlay.addEventListener('click', () => {
                if (this.trajectory.points.length < 2) {
                    this.generatePresetShape('circle');
                    return;
                }
                this.trajectory.isPlaying = !this.trajectory.isPlaying;
                this.updatePlayButtonVisual();
                if (this.trajectory.isPlaying) {
                    this.logToTerminal(`[Yörünge] Yörünge takibi başlatıldı (Hız: ${this.trajectory.speed} mm/s).`);
                } else {
                    this.logToTerminal('[Yörünge] Yörünge takibi duraklatıldı.');
                }
            });
        }

        // Clear
        if (this.elements.btnTrajClear) {
            this.elements.btnTrajClear.addEventListener('click', () => {
                this.trajectory.isPlaying = false;
                this.trajectory.points = [];
                this.trajectory.distances = [];
                this.trajectory.totalLength = 0;
                this.trajectory.progress = 0;
                this.trajectory.activeShape = null;
                this.clearActiveShapeButtons();
                this.updatePlayButtonVisual();
                this.simulator.clearTrajectoryPath();
                this.simulator.setTarget(0, 0);
                this.elements.sliderTargetX.value = 0;
                this.elements.sliderTargetY.value = 0;
                this.elements.valTargetX.innerText = 0;
                this.elements.valTargetY.innerText = 0;
                this.elements.padInfo.innerText = 'Tıklayarak veya çizerek yörünge oluşturun';
                this.renderPad();
                this.logToTerminal('[Yörünge] Yörünge temizlendi, hedef merkeze alındı.');
            });
        }

        // Speed slider
        if (this.elements.sliderTrajSpeed) {
            this.elements.sliderTrajSpeed.addEventListener('input', () => {
                this.trajectory.speed = parseInt(this.elements.sliderTrajSpeed.value);
                this.elements.valTrajSpeed.innerText = `${this.trajectory.speed} mm/s`;
            });
        }

        // Animation / step loop
        let lastT = performance.now();
        const animLoop = (t) => {
            requestAnimationFrame(animLoop);
            const dt = Math.min(0.05, (t - lastT) / 1000.0);
            lastT = t;

            if (window.currentMode === 'simulator') {
                if (this.trajectory.isPlaying && this.trajectory.points.length > 1) {
                    this.stepTrajectoryFollow(dt);
                }
                this.renderPad();
            }
        };
        requestAnimationFrame(animLoop);
    }

    clearActiveShapeButtons() {
        ['btnShapeCircle', 'btnShapeTriangle', 'btnShapeSquare', 'btnShapeInfinity'].forEach(id => {
            if (this.elements[id]) this.elements[id].classList.remove('active');
        });
    }

    updatePlayButtonVisual() {
        if (!this.elements.btnTrajPlay) return;
        if (this.trajectory.isPlaying) {
            this.elements.btnTrajPlay.className = 'btn btn-danger btn-full';
            this.elements.btnTrajPlay.innerHTML = '<i data-lucide="pause"></i> Duraklat';
        } else {
            this.elements.btnTrajPlay.className = 'btn btn-primary btn-full';
            this.elements.btnTrajPlay.innerHTML = '<i data-lucide="play"></i> Takip Başlat';
        }
        lucide.createIcons();
    }

    generatePresetShape(type) {
        this.clearActiveShapeButtons();
        let pts = [];
        let infoText = '';

        if (type === 'circle') {
            if (this.elements.btnShapeCircle) this.elements.btnShapeCircle.classList.add('active');
            const R = 38;
            const N = 64;
            for (let i = 0; i <= N; i++) {
                const a = (i / N) * Math.PI * 2;
                pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
            }
            infoText = 'Daire (R = 38 mm)';
        } else if (type === 'triangle') {
            if (this.elements.btnShapeTriangle) this.elements.btnShapeTriangle.classList.add('active');
            const R = 44;
            const v = [
                { x: 0, y: R },
                { x: R * Math.cos(-Math.PI / 6), y: R * Math.sin(-Math.PI / 6) },
                { x: -R * Math.cos(-Math.PI / 6), y: R * Math.sin(-Math.PI / 6) }
            ];
            const seg = 20;
            for (let s = 0; s < 3; s++) {
                const p1 = v[s];
                const p2 = v[(s + 1) % 3];
                for (let k = 0; k < seg; k++) {
                    const u = k / seg;
                    pts.push({ x: p1.x + (p2.x - p1.x) * u, y: p1.y + (p2.y - p1.y) * u });
                }
            }
            pts.push({ x: v[0].x, y: v[0].y });
            infoText = 'Eşkenar Üçgen';
        } else if (type === 'square') {
            if (this.elements.btnShapeSquare) this.elements.btnShapeSquare.classList.add('active');
            const W = 34; // 68x68 mm square
            const corners = [
                { x: W, y: W },
                { x: -W, y: W },
                { x: -W, y: -W },
                { x: W, y: -W }
            ];
            const seg = 16;
            for (let s = 0; s < 4; s++) {
                const p1 = corners[s];
                const p2 = corners[(s + 1) % 4];
                for (let k = 0; k < seg; k++) {
                    const u = k / seg;
                    pts.push({ x: p1.x + (p2.x - p1.x) * u, y: p1.y + (p2.y - p1.y) * u });
                }
            }
            pts.push({ x: corners[0].x, y: corners[0].y });
            infoText = 'Kare (68x68 mm)';
        } else if (type === 'infinity') {
            if (this.elements.btnShapeInfinity) this.elements.btnShapeInfinity.classList.add('active');
            const A = 65, B = 32;
            const N = 72;
            for (let i = 0; i <= N; i++) {
                const t = (i / N) * Math.PI * 2;
                pts.push({ x: A * Math.sin(t), y: B * Math.sin(2 * t) });
            }
            infoText = 'Sekiz / Sonsuzluk';
        }

        this.trajectory.points = pts;
        this.trajectory.activeShape = type;
        this.trajectory.progress = 0;
        this.updateTrajectoryDistances();
        this.simulator.setTrajectoryPath(pts);

        // Put target at first point
        const p0 = pts[0];
        this.simulator.setTarget(p0.x, p0.y);
        this.elements.sliderTargetX.value = Math.round(p0.x);
        this.elements.sliderTargetY.value = Math.round(p0.y);
        this.elements.valTargetX.innerText = Math.round(p0.x);
        this.elements.valTargetY.innerText = Math.round(p0.y);

        this.elements.padInfo.innerText = `${infoText} (${pts.length} nokta)`;
        this.trajectory.isPlaying = true;
        this.updatePlayButtonVisual();
        this.logToTerminal(`[Yörünge] Otomatik ${infoText} yüklendi ve takip başlatıldı.`);
        this.renderPad();
    }

    updateTrajectoryDistances() {
        const pts = this.trajectory.points;
        const dists = [0];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
            const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            total += d;
            dists.push(total);
        }
        this.trajectory.distances = dists;
        this.trajectory.totalLength = Math.max(1, total);
    }

    stepTrajectoryFollow(dt) {
        const traj = this.trajectory;
        if (traj.points.length < 2 || traj.totalLength <= 0) return;

        traj.progress += traj.speed * dt;
        if (traj.progress >= traj.totalLength) {
            traj.progress %= traj.totalLength;
        }

        const s = traj.progress;
        const pts = traj.points;
        const dists = traj.distances;

        let idx = 0;
        for (let i = 0; i < dists.length - 1; i++) {
            if (s >= dists[i] && s <= dists[i + 1]) {
                idx = i;
                break;
            }
        }

        const dSeg = dists[idx + 1] - dists[idx];
        const alpha = dSeg > 0.001 ? (s - dists[idx]) / dSeg : 0;
        const pA = pts[idx];
        const pB = pts[idx + 1];

        const targetX = pA.x + (pB.x - pA.x) * alpha;
        const targetY = pA.y + (pB.y - pA.y) * alpha;

        this.simulator.setTarget(targetX, targetY);
        this.elements.sliderTargetX.value = Math.round(targetX);
        this.elements.sliderTargetY.value = Math.round(targetY);
        this.elements.valTargetX.innerText = Math.round(targetX);
        this.elements.valTargetY.innerText = Math.round(targetY);
    }

    renderPad() {
        const canvas = this.elements.padCanvas;
        if (!canvas) return;
        const ctx = this.padCtx;
        const w = canvas.width;
        const h = canvas.height;

        // Dark background
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, w, h);

        // Grid lines (every 25 mm)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
        ctx.lineWidth = 1;
        for (let x = -100; x <= 100; x += 25) {
            const cx = x + 111;
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, h);
            ctx.stroke();
        }
        for (let y = -50; y <= 50; y += 25) {
            const cy = 65 - y;
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(w, cy);
            ctx.stroke();
        }

        // Center crosshair (0, 0)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.20)';
        ctx.beginPath();
        ctx.moveTo(111, 0);
        ctx.lineTo(111, h);
        ctx.moveTo(0, 65);
        ctx.lineTo(w, 65);
        ctx.stroke();

        // Screen border
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.strokeRect(1, 1, w - 2, h - 2);

        // Draw trajectory path
        const pts = this.trajectory.points;
        if (pts.length > 1) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pts[0].x + 111, 65 - pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x + 111, 65 - pts[i].y);
            }
            ctx.stroke();
        }

        // Draw Target Marker on pad
        const tx = this.simulator.state.simulated.targetX;
        const ty = this.simulator.state.simulated.targetY;
        const cxTarget = tx + 111;
        const cyTarget = 65 - ty;

        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cxTarget, cyTarget, 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cxTarget, cyTarget, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw real-time Ball position on pad
        if (this.simulator.state.simulated.ballOnPlate) {
            const bx = this.simulator.state.simulated.x;
            const by = this.simulator.state.simulated.y;
            const cxBall = bx + 111;
            const cyBall = 65 - by;

            // Outer green glow
            ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
            ctx.beginPath();
            ctx.arc(cxBall, cyBall, 7, 0, Math.PI * 2);
            ctx.fill();

            // Core solid dot
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(cxBall, cyBall, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Web Serial Actions
    async toggleSerialConnection() {
        if (this.port) {
            // Disconnect
            this.logToTerminal('[Sistem] Bağlantı kesiliyor...', 'system');
            this.readLoopActive = false;
            
            if (this.reader) {
                try {
                    await this.reader.cancel();
                } catch (e) {}
            }
            
            // Reset badge
            this.updateStatusBadge('disconnected');
            this.elements.btnConnect.innerHTML = '<i data-lucide="link"></i> Bağlan';
            this.elements.btnConnect.classList.remove('btn-danger');
            this.elements.btnConnect.classList.add('btn-primary');
            lucide.createIcons();
            
            this.port = null;
            this.reader = null;
        } else {
            // Connect
            try {
                this.port = await navigator.serial.requestPort();
                const baud = parseInt(this.elements.baudrate.value);
                
                this.logToTerminal(`[Sistem] Port açılıyor... Baud Rate: ${baud}`, 'system');
                await this.port.open({ baudRate: baud });
                
                this.updateStatusBadge('connected');
                this.elements.btnConnect.innerHTML = '<i data-lucide="link-2"></i> Bağlantıyı Kes';
                this.elements.btnConnect.classList.remove('btn-primary');
                this.elements.btnConnect.classList.add('btn-danger');
                lucide.createIcons();
                
                this.logToTerminal('[Sistem] Bağlantı başarılı! Veri bekleniyor...', 'system');
                this.startReading();
            } catch (err) {
                this.logToTerminal(`[Bağlantı Hatası] ${err.message}`, 'error');
                this.port = null;
            }
        }
    }

    async startReading() {
        this.readLoopActive = true;
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        this.reader = reader;

        let buffer = '';

        try {
            while (this.readLoopActive) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }
                
                buffer += value;
                const lines = buffer.split('\n');
                
                // Keep the incomplete last line in the buffer
                buffer = lines.pop();
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.length > 0) {
                        this.parseSerialLine(trimmedLine);
                    }
                }
            }
        } catch (error) {
            this.logToTerminal(`[Okuma Hatası] Bağlantı beklenmedik şekilde kesildi: ${error.message}`, 'error');
            this.toggleSerialConnection(); // Trigger disconnect cleanups
        } finally {
            reader.releaseLock();
            try {
                await readableStreamClosed;
            } catch (e) {}
        }
    }

    parseSerialLine(line) {
        // Print raw lines to visual terminal log
        this.logToTerminal(line, 'rx');

        if (window.currentMode !== 'serial') return; // Ignore serial data if in simulation mode

        // 1. Check for "Temas yok" (No Touch)
        if (line.includes("Temas yok")) {
            this.simulator.state.simulated.ballOnPlate = false;
            this.simulator.ball.visible = false;
            
            this.elements.lblPosX.innerText = 'Temas Yok';
            this.elements.lblPosY.innerText = 'Temas Yok';
            
            // Draw charts reference line as 0 or empty, let's feed 0s for simplicity
            const now = new Date().toLocaleTimeString();
            this.charts.pushData(now, 0, 0, 0, 0, 0, 0, 0, 0);
            return;
        }

        // 2. Regular Expression matching Arduino Serial output format:
        // X: -2.34 | Y: 1.23 | Vx: 0.12 | Vy: -0.45 | Roll: 2.10 | Pitch: -1.50
        const pattern = /X:\s*([-\d.]+)\s*\|\s*Y:\s*([-\d.]+)\s*\|\s*Vx:\s*([-\d.]+)\s*\|\s*Vy:\s*([-\d.]+)\s*\|\s*Roll:\s*([-\d.]+)\s*\|\s*Pitch:\s*([-\d.]+)/;
        const match = line.match(pattern);

        if (match) {
            const x_filtre = parseFloat(match[1]); // This is x_filtre (rotated in ESP32)
            const y_filtre = parseFloat(match[2]); // This is y_filtre (rotated in ESP32)
            const vx_filtre = parseFloat(match[3]);
            const vy_filtre = parseFloat(match[4]);
            const roll = parseFloat(match[5]);
            const pitch = parseFloat(match[6]);

            // ESP32'nin gönderdiği X/Y kontrol eksenindedir (x_filtre, y_filtre).
            // Gerçek dokunmatik ekran koordinatına (x_c: uzun kenar, y_c: kısa kenar) geri çevir.
            const ekran = this.simulator.kontrolToEkran(x_filtre, y_filtre);
            const x_c = ekran.x;
            const y_c = ekran.y;

            // Hızlar da aynı doğrusal dönüşümle ekran eksenine çevrilir
            const ekranHiz = this.simulator.kontrolToEkran(vx_filtre, vy_filtre);
            const vx_c = ekranHiz.x;
            const vy_c = ekranHiz.y;

            // Update stats text in the layout using screen coordinates (X is long, Y is short)
            this.elements.lblPosX.innerHTML = `${x_c.toFixed(1)} <span class="unit">mm</span>`;
            this.elements.lblPosY.innerHTML = `${y_c.toFixed(1)} <span class="unit">mm</span>`;
            this.elements.lblPitch.innerHTML = `${pitch.toFixed(2)} <span class="unit">°</span>`;
            this.elements.lblRoll.innerHTML = `${roll.toFixed(2)} <span class="unit">°</span>`;

            // Update 3D visualization objects (plaka eğimi ekran eksenine çevrilerek çizilir)
            this.simulator.ball.visible = true;
            this.simulator.state.simulated.ballOnPlate = true;
            const gorsel = this.simulator.gorselEgim(roll, pitch);
            this.simulator.updateKinematics(gorsel.roll, gorsel.pitch, 0, SimConfig.Z_YUKSEKLIK);
            this.simulator.updateBallPosition(x_c, y_c); // Place ball at correct physical coordinates!

            // Feed Chart data with rate throttling
            const nowMs = performance.now();
            if (nowMs - this.lastChartUpdateTime > this.chartIntervalMs) {
                const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                // Feed actual physical coordinates to charts
                this.charts.pushData(timeString, x_c, y_c, 0, 0, vx_c, vy_c, roll, pitch);
                this.lastChartUpdateTime = nowMs;
            }
        }
    }

    logToTerminal(text, type = 'normal') {
        const line = document.createElement('div');
        line.className = `terminal-line ${type}-line`;
        
        // Add current timestamp for system logging
        if (type === 'system' || type === 'error') {
            const ts = new Date().toLocaleTimeString();
            line.innerText = `[${ts}] ${text}`;
        } else {
            line.innerText = text;
        }

        this.elements.terminalLog.appendChild(line);
        
        // Auto scroll if scrolled near bottom
        const threshold = 40;
        const isNearBottom = this.elements.terminalLog.scrollHeight - this.elements.terminalLog.clientHeight - this.elements.terminalLog.scrollTop < threshold;
        if (isNearBottom) {
            this.elements.terminalLog.scrollTop = this.elements.terminalLog.scrollHeight;
        }

        // Memory optimization: Cap terminal lines to last 150 entries
        while (this.elements.terminalLog.children.length > 150) {
            this.elements.terminalLog.removeChild(this.elements.terminalLog.firstChild);
        }
    }
}

// Instantiate application on window load
window.addEventListener('DOMContentLoaded', () => {
    window.appInstance = new AppController();
    
    // Periodically feed charts in simulator mode (e.g. 20 times a second)
    setInterval(() => {
        if (window.currentMode === 'simulator') {
            const sim = window.appInstance.simulator;
            const charts = window.appInstance.charts;
            const simState = sim.state.simulated;
            
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            if (simState.ballOnPlate) {
                charts.pushData(
                    timeString, 
                    simState.x, 
                    simState.y, 
                    simState.targetX, 
                    simState.targetY, 
                    simState.vx, 
                    simState.vy, 
                    simState.roll, 
                    simState.pitch
                );
            } else {
                // If ball fell off, plot null/0 lines
                charts.pushData(
                    timeString, 
                    0, 
                    0, 
                    simState.targetX, 
                    simState.targetY, 
                    0, 
                    0, 
                    simState.roll, 
                    simState.pitch
                );
            }
        }
    }, 50);
});
