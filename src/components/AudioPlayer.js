import React, { useState, useRef, useEffect } from 'react';
import Meyda from 'meyda';

const AudioPlayer = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [sourceNode, setSourceNode] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioProgress, setAudioProgress] = useState(0);
    //feature states
    const [spectralCentroid, setSpectralCentroid] = useState(null);
    const [rms, setRms] = useState(null);
    const [zcr, setZcr] = useState(null);
    const [loudness, setLoudness] = useState(null);
    const [chroma, setChroma] = useState(null);

    const audioElementRef = useRef(null);
    const meydaRef = useRef(null);
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const audioProgressRef = useRef(null);
    const chromaCanvasRef = useRef(null);
    const [chromaData, setChromaData] = useState([]); // Stores chroma data over time
    const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
    const lowResChromaCanvasRef = useRef(null);
    const lastUpdateTimeRef = useRef(null);


    // feature refs
    const spectralCentroidRef = useRef(null);
    const rmsRef = useRef(null);
    const zcrRef = useRef(null);
    const loudnessRef = useRef(null);
    const chromaRef = useRef(null);

    useEffect(() => {
        const newAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(newAudioContext);
        return () => {
            newAudioContext.close();
        };
    }, []);

    // Update audio progress as the audio plays
    useEffect(() => {
        if (audioElementRef.current) {
            const updateProgress = () => {
                const progress = (audioElementRef.current.currentTime / audioElementRef.current.duration) * 100;
                setAudioProgress(progress);
                audioProgressRef.current = progress; // Store value in ref for real-time access
            };

            audioElementRef.current.addEventListener('timeupdate', updateProgress);

            return () => {
                audioElementRef.current.removeEventListener('timeupdate', updateProgress);
            };
        }
    }, []);

    const togglePlayPause = () => {
        if (audioElementRef.current) {
            if (isPlaying) {
                audioElementRef.current.pause();
                if (meydaRef.current) meydaRef.current.stop();
                cancelAnimationFrame(animationRef.current); // Stop the drawing loop
            } else {
                audioElementRef.current.play();
                audioContext.resume().then(() => {
                    if (meydaRef.current) {
                        meydaRef.current.start();
                    }
                    
                });
            }
            setIsPlaying(!isPlaying);
        }
    };

    // If there is audio playing, visualize it
    useEffect(() => {
        if (isPlaying) {
            drawVisualizer();
        }
    }, [isPlaying]);
    

    const handleFileChange = async event => {
        try {
            const file = event.target.files[0];
            const audioURL = URL.createObjectURL(file);
            audioElementRef.current.src = audioURL;

            audioElementRef.current.oncanplay = () => {
                if (!isPlaying) {
                    togglePlayPause(); // Start playing and analyzing when audio is ready to play
                }
            };
    
            if (sourceNode) {
                sourceNode.disconnect();
                if (meydaRef.current) meydaRef.current.stop();
            }
    
            const newSourceNode = audioContext.createMediaElementSource(audioElementRef.current);
            const analyser = audioContext.createAnalyser();
            newSourceNode.connect(analyser);
            analyser.connect(audioContext.destination);
    
            setSourceNode(newSourceNode);
    
            initiateMeyda(newSourceNode, analyser);
            //drawVisualizer(analyser);
        } catch (error) {
            console.error('Error handling file change:', error);
        }
    };
    

    const initiateMeyda = (source, analyser) => {
        if (!audioContext || !source) {
            console.error('Meyda cannot be initiated due to missing audio context or source.');
            return;
        }
    
        if (audioContext.state !== 'running') {
            audioContext.resume().then(() => {
                console.log('Audio Context is now running');
            });
        }
    
        if (meydaRef.current) {
            meydaRef.current.stop();
        }
    
        try {
            meydaRef.current = Meyda.createMeydaAnalyzer({
                audioContext: audioContext,
                source: source,
                bufferSize: 512,
                featureExtractors: ['spectralCentroid', 'rms', 'zcr', 'loudness', 'chroma'],
                callback: features => {
                    //console.log('Meyda features:', features);
                    if (features && features.spectralCentroid) {
                        setSpectralCentroid(features.spectralCentroid);
                        spectralCentroidRef.current = features.spectralCentroid; // Store value in ref for real-time access
                    }
                    if (features.rms) {
                        setRms(features.rms);
                        rmsRef.current = features.rms; // Store value in ref for real-time access
                    }
                    if (features.zcr) {
                        setZcr(features.zcr);
                        zcrRef.current = features.zcr; // Store value in ref for real-time access
                    }
                    if (features.loudness) {
                        setLoudness(features.loudness.total);
                        loudnessRef.current = features.loudness.total; // Store value in ref for real-time access
                    }
                    if(features.chroma) {
                        setChroma(features.chroma);
                        chromaRef.current = features.chroma; // Store value in ref for real-time access


                        if (features.chroma && Date.now() - lastUpdateTimeRef.current >= 1000) {
                            setChromaData(prevData => [...prevData, features.chroma]);
                            setLastUpdateTime(Date.now());
                            lastUpdateTimeRef.current = Date.now(); // Store value in ref for real-time access
                        }
                    }
                }
            });
            if (isPlaying && !meydaRef.current.isRunning) {
                meydaRef.current.start();
            }
        }
        catch (error) {
            console.error('Error initiating Meyda:', error);
        }
    };
    

    
    useEffect(() => {
        return () => {
            if (sourceNode) {
                sourceNode.disconnect();
                cancelAnimationFrame(animationRef.current);
            }
            if (meydaRef.current) {
                meydaRef.current.stop();
            }
        };
    }, [sourceNode]);

    const drawVisualizer = () => {
        if (!audioElementRef.current || !canvasRef.current || !isPlaying) {
            console.log('Audio element or canvas not ready, or audio not playing');
            return;
        }
        
        // Notes for chroma
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;
        const progressBarHeight = 25; // Height of the progress bar
        const chromaHeight = 20; // Height for the Chroma visualization
        const spaceBetween = 0; // Extra space between components
        const waveformHeight = HEIGHT - progressBarHeight - chromaHeight - spaceBetween; // Adjust height for waveform
    
        // Assuming sourceNode is connected to an analyser
        const analyser = audioContext.createAnalyser();
        sourceNode.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
    
        const draw = () => {
            if (!isPlaying) {
                return; // Stop updating if the audio is no longer playing
            }
            animationRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
    
            ctx.clearRect(0, 0, WIDTH, HEIGHT); // Clear the canvas
    
            let x = 0;
            const barWidth = (WIDTH / bufferLength) * 2.5;
            const maxBarHeight = waveformHeight; // Maximum height a bar can reach
    
            // Use RMS for opacity
            const rmsValue = rmsRef.current ? rmsRef.current * 100 : 0;
            const opacity = Math.min(Math.max(rmsValue / 10, 0.3), 1);
    
            // Use Loudness for color
            const loudnessValue = loudnessRef.current ? loudnessRef.current : 0;
            const colorValue = Math.min(loudnessValue * 5, 255);
    
            for (let i = 0; i < bufferLength; i++) {
                // Apply a logarithmic transformation to scale the bar height
                const barHeight = Math.pow(dataArray[i] / 255, 2) * maxBarHeight;

                // Use ZCR for bar thickness
                const zcrValue = zcrRef.current ? zcrRef.current : 0;
                const thickness = Math.min(Math.max(zcrValue / 100, 1), 3);

                console.log('Thickness: ', thickness);
    
                 // Dynamic color based on bar height
                const hue = (i / bufferLength) * 360; // Color hue varies across the spectrum
                const saturation = 100; // Full saturation for vibrant colors
                const lightness = (barHeight / maxBarHeight) * 50; // Lightness varies based on bar height

                ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                ctx.fillRect(x, waveformHeight - barHeight, barWidth * thickness, barHeight);
                x += (barWidth * thickness) + 1;
            }
    
            // Progress bar
            const progressBarY = waveformHeight + spaceBetween; // Position for the Progress Bar
            ctx.fillStyle = 'rgba(0, 123, 255, 0.5)';
            ctx.fillRect(0, progressBarY, WIDTH * (audioProgressRef.current / 100), progressBarHeight);

            // Chroma visualization
            if (chromaRef.current) {
                const chromaY = HEIGHT - chromaHeight; // Position for the Chroma visualization
                const chromaBarWidth = WIDTH / chromaRef.current.length;
                chromaRef.current.forEach((value, index) => {
                    const chromaBarHeight = value * chromaHeight;
                    ctx.fillStyle = `hsl(${index * 30}, 100%, 50%)`;
                    ctx.fillRect(index * chromaBarWidth, chromaY, chromaBarWidth, chromaBarHeight);
                
                // Draw labels for chroma
                ctx.font = '10px Arial';
                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                chromaRef.current.forEach((_, index) => {
                    ctx.fillText(notes[index], (index * chromaBarWidth) + (chromaBarWidth / 2), HEIGHT - 3);
                });
                });
            }

            // Draw labels for waveform and progress in the right-side corners
            ctx.font = '10px Arial';
            ctx.fillText('Waveform', WIDTH - 40, 20); // Adjust coordinates as needed

            const progressText = 'Progress: ' + audioProgressRef.current + '%';
            ctx.fillText(progressText, WIDTH - 120, progressBarY + 15);

        };
    
        draw();
    };
    
    const drawChromaVisualization = () => {
        try{
            if (!chromaCanvasRef.current || !chromaRef.current || !chromaRef.current.length) {
                return;
            }
            const canvas = chromaCanvasRef.current;
            const ctx = canvas.getContext('2d');
            const WIDTH = canvas.width;
            const HEIGHT = canvas.height;
            const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            
            // Calculate the width for each chroma data point
            const chromaWidth = WIDTH / chromaRef.current.length;
            const chromaHeight = HEIGHT / notes.length;
        
            // Shift existing visualization to the left
            const imageData = ctx.getImageData(chromaWidth, 0, WIDTH - chromaWidth, HEIGHT);
            ctx.putImageData(imageData, 0, 0);
        
            // Draw the new chroma data at the end
            chroma.forEach((intensity, noteIndex) => {
                const colorIntensity = Math.round(intensity * 255);
                ctx.fillStyle = `rgb(${colorIntensity}, ${colorIntensity}, ${colorIntensity})`;
                ctx.fillRect(WIDTH - chromaWidth, noteIndex * chromaHeight, chromaWidth, chromaHeight);
            });
        
            // Draw labels for notes (optional, can be done once outside this function)
            ctx.font = '10px Arial';
            ctx.fillStyle = 'black';
            notes.forEach((note, index) => {
                ctx.fillText(note, 0, index * chromaHeight + chromaHeight / 2);
            });
        } catch (error) {
            console.error('Error drawing chroma visualization:', error);
        }
    };
    
    useEffect(() => {
        drawChromaVisualization();
    }, [chroma]);

    const drawLowResChromaGraph = () => {
        if (!lowResChromaCanvasRef.current || !chromaData.length) {
            return;
        }

        const canvas = lowResChromaCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
        const chromaWidth = WIDTH / chromaData.length;
    
        chromaData.forEach((chroma, index) => {
            const maxIntensityIndex = chroma.indexOf(Math.max(...chroma)); // Find the note with the highest intensity
            const note = notes[maxIntensityIndex];
            const yPosition = (maxIntensityIndex / notes.length) * HEIGHT;
    
            ctx.fillStyle = 'black';
            ctx.fillRect(index * chromaWidth, yPosition, chromaWidth, HEIGHT / notes.length);
    
            // Optionally, draw the note label
            ctx.fillStyle = 'green';
            ctx.font = '12px Arial';
            // make the font bold
            ctx.fontWeight = 'bold';
            
            ctx.fillText(note, index * chromaWidth, yPosition + 10);
        });
    };
    
    useEffect(() => {
        
        drawLowResChromaGraph();
    }, [chromaData]);
    
    
    useEffect(() => {
        // Function to update canvas size
        const updateCanvasSize = () => {

            const containerWidth = document.querySelector('.canvas-container').clientWidth;

            // if its the same return
            if (canvasRef.current && canvasRef.current.width === containerWidth) {
                return;
            }
    
            // Update size of all canvases
            [canvasRef, chromaCanvasRef, lowResChromaCanvasRef].forEach(ref => {
                if (ref.current) {
                    ref.current.width = containerWidth;
                    ref.current.height = 200; // Fixed height
                }
            });
    
            // Redraw visualizations
            if (isPlaying) {
                drawVisualizer();
                drawChromaVisualization();
                drawLowResChromaGraph();
            }
        };
    
        // Call it initially and add event listener
        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
    
        // Cleanup
        return () => {
            window.removeEventListener('resize', updateCanvasSize);
        };
    }, [isPlaying]); // Dependencies: isPlaying
    
    return (
        <div className="app-container">
            <div className="card">
                <div className="audio-controls">
                    <input type="file" onChange={handleFileChange} accept="audio/*" />
                    <audio ref={audioElementRef} controls style={{ display: 'none' }}></audio>
                    <button onClick={togglePlayPause}>
                        {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    {/* Show the  time elapsed if there is an audio file. AudioElementRef is set to null*/}
                    {/* If it doesn't exist we should show nothing */}
                    {sourceNode && (
                        <span className="time-elapsed">
                            Time Elapsed / Total Time (s): {audioElementRef.current ? audioElementRef.current.currentTime.toFixed(2) : '0.00'} / {audioElementRef.current ? audioElementRef.current.duration.toFixed(2) : '0.00'}
                        </span>
                    )}
    
                </div>
                <div className="canvas-container">
                    <canvas ref={canvasRef} width="750" height="200"></canvas>
                    <canvas ref={chromaCanvasRef} width="750" height="200"></canvas> {/* New canvas for chroma */}
                    <canvas ref={lowResChromaCanvasRef} width="750" height="200"></canvas> {/* New canvas for low-res chroma */}
                </div>
                <p className="feature-container">
                    Spectral Centroid: {spectralCentroid !== null ? spectralCentroid.toFixed(2) : 'Not available'}
                </p>
                <p className="feature-container">
                    RMS: {rms !== null ? (rms * 100).toFixed(2) : 'Not available'}
                </p>
                <p className="feature-container">
                    ZCR: {zcr !== null ? Math.round(zcr) : 'Not available'}
                </p>
                <p className="feature-container">
                    Loudness: <span className={loudness > 50 ? 'high-loudness' : ''}>
                        {loudness !== null ? loudness.toFixed(2) : 'Not available'}
                    </span>
                </p>
                <p className="feature-container">
                    Chroma: {chroma !== null ? chroma.map(val => val.toFixed(2)).join(' ') : 'Not available'}
                </p>
            </div>
        </div>
    );
    
    
};

export default AudioPlayer;
