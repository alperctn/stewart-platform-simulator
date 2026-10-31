// Stewart Platform (Ball & Plate) Simulator - Real-time Charts Configuration

class StewartCharts {
    constructor() {
        this.maxDataPoints = 120; // Number of points to keep in memory
        
        // Chart Instances
        this.posChart = null;
        this.velChart = null;
        this.angleChart = null;
        
        this.initCharts();
    }

    initCharts() {
        const gridColor = 'rgba(255, 255, 255, 0.04)';
        const textColor = '#9CA3AF';
        
        const chartOptions = (yLabel, yMin, yMax) => ({
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Performance: Disable animations for real-time streaming
            elements: {
                point: {
                    radius: 0 // Performance: Hide points, only show lines
                },
                line: {
                    tension: 0.15,
                    borderWidth: 2
                }
            },
            scales: {
                x: {
                    type: 'category',
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        display: false // Hide timestamps/X ticks for cleaner real-time aesthetic
                    }
                },
                y: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            family: 'JetBrains Mono',
                            size: 9
                        }
                    },
                    title: {
                        display: true,
                        text: yLabel,
                        color: textColor,
                        font: {
                            size: 10,
                            weight: '600'
                        }
                    },
                    min: yMin,
                    max: yMax
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        font: {
                            size: 10,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: '#1F2937',
                    titleColor: '#F3F4F6',
                    bodyColor: '#F3F4F6',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    titleFont: { family: 'Inter' },
                    bodyFont: { family: 'JetBrains Mono' }
                }
            }
        });

        // 1. Position Chart (X & Y, with references)
        const ctxPos = document.getElementById('chart-pos').getContext('2d');
        this.posChart = new Chart(ctxPos, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'X Pozisyonu',
                        data: [],
                        borderColor: '#EC4899', // Pink
                        backgroundColor: 'rgba(236, 72, 153, 0.05)',
                        fill: false
                    },
                    {
                        label: 'Y Pozisyonu',
                        data: [],
                        borderColor: '#3B82F6', // Blue
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        fill: false
                    },
                    {
                        label: 'Hedef X',
                        data: [],
                        borderColor: 'rgba(236, 72, 153, 0.25)',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        fill: false
                    },
                    {
                        label: 'Hedef Y',
                        data: [],
                        borderColor: 'rgba(59, 130, 246, 0.25)',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        fill: false
                    }
                ]
            },
            options: chartOptions('Pozisyon (mm)', -115, 115)
        });

        // 2. Velocity Chart (Vx & Vy)
        const ctxVel = document.getElementById('chart-vel').getContext('2d');
        this.velChart = new Chart(ctxVel, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Vx (X Hızı)',
                        data: [],
                        borderColor: '#10B981', // Green
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        fill: false
                    },
                    {
                        label: 'Vy (Y Hızı)',
                        data: [],
                        borderColor: '#F59E0B', // Amber
                        backgroundColor: 'rgba(245, 158, 11, 0.05)',
                        fill: false
                    }
                ]
            },
            options: chartOptions('Hız (mm/s)', -400, 400)
        });

        // 3. Control Angles Chart (Roll & Pitch)
        const ctxAngles = document.getElementById('chart-angles').getContext('2d');
        this.angleChart = new Chart(ctxAngles, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Pitch (Eğim)',
                        data: [],
                        borderColor: '#8B5CF6', // Purple
                        backgroundColor: 'rgba(139, 92, 246, 0.05)',
                        fill: false
                    },
                    {
                        label: 'Roll (Yatış)',
                        data: [],
                        borderColor: '#06B6D4', // Cyan
                        backgroundColor: 'rgba(6, 182, 212, 0.05)',
                        fill: false
                    }
                ]
            },
            options: chartOptions('Açı (Derece)', -8.0, 8.0)
        });
    }

    // Function to feed real-time values into the charts
    pushData(timeLabel, x, y, targetX, targetY, vx, vy, roll, pitch) {
        [this.posChart, this.velChart, this.angleChart].forEach(chart => {
            chart.data.labels.push(timeLabel);
            if (chart.data.labels.length > this.maxDataPoints) {
                chart.data.labels.shift();
            }
        });

        // 1. Update Position Chart
        const posData = this.posChart.data.datasets;
        posData[0].data.push(x);
        posData[1].data.push(y);
        posData[2].data.push(targetX);
        posData[3].data.push(targetY);
        
        // 2. Update Velocity Chart
        const velData = this.velChart.data.datasets;
        velData[0].data.push(vx);
        velData[1].data.push(vy);

        // 3. Update Angle Chart
        const angleData = this.angleChart.data.datasets;
        angleData[0].data.push(pitch);
        angleData[1].data.push(roll);

        // Shift data to maintain max count limit
        [posData, velData, angleData].forEach(datasets => {
            datasets.forEach(dataset => {
                if (dataset.data.length > this.maxDataPoints) {
                    dataset.data.shift();
                }
            });
        });

        // Fast update without recalculating animation states
        this.posChart.update('none');
        this.velChart.update('none');
        this.angleChart.update('none');
    }

    clear() {
        [this.posChart, this.velChart, this.angleChart].forEach(chart => {
            chart.data.labels = [];
            chart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            chart.update();
        });
    }
}
