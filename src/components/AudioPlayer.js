import React, { useState, useRef, useEffect } from 'react';
import Meyda from 'meyda';

const AudioPlayer = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [sourceNode, setSourceNode] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
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
    
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;
    
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
    
            const barWidth = (WIDTH / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            console.log('colorIntensity:', Math.min(spectralCentroidRef.current / 2, 255));
    
            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i];

                let colorIntensity = Math.min(spectralCentroidRef.current * 25, 255);
    
                ctx.fillStyle = `rgb(${colorIntensity},100,100)`;
                ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };
    
        draw();
    };
    

    return (
        <div className="app-container">
            <div className="card">
                <div className="audio-controls">
                    <input type="file" onChange={handleFileChange} accept="audio/*" />
                    <audio ref={audioElementRef} controls style={{ display: 'none' }}></audio>
                    <button onClick={togglePlayPause}>
                        {isPlaying ? 'Pause' : 'Play'}
                    </button>
                </div>
                <div className="canvas-container">
                    <canvas ref={canvasRef} width="500" height="150"></canvas>
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
