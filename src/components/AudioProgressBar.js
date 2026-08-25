import React, { useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';

/**
 * Fortschrittsbalken für die Audio-Wiedergabe, an der langen Seite des
 * Displays platziert (horizontal unten im Querformat, vertikal am rechten
 * Rand im Hochformat - siehe orientation-Prop). Spulen ausschließlich per
 * Ziehen (Drag/Pan) - ein reiner Tap wird bewusst ignoriert (kein
 * onMoveShouldSetPanResponder-Trigger unterhalb der Mindest-Zugdistanz, und
 * onPanResponderRelease ruft onSeek nur, wenn tatsächlich eine Bewegung
 * stattgefunden hat), um versehentliches Verspringen beim Antippen zu
 * vermeiden.
 */
export function AudioProgressBar({ orientation, progress, onSeek }) {
  const isHorizontal = orientation === 'horizontal';
  const trackLengthRef = useRef(0);
  const dragFractionRef = useRef(null);
  const movedRef = useRef(false);
  const [dragFraction, setDragFraction] = useState(null);

  function updateDragFraction(evt) {
    const length = trackLengthRef.current;
    if (!length) return;
    const { locationX, locationY } = evt.nativeEvent;
    // Verlauf horizontal von links nach rechts, vertikal von oben nach
    // unten - Zug-Position wird 1:1 (nicht invertiert) auf den Fortschritt abgebildet.
    const raw = isHorizontal ? locationX / length : locationY / length;
    const clamped = Math.max(0, Math.min(1, raw));
    dragFractionRef.current = clamped;
    setDragFraction(clamped);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const dist = isHorizontal ? Math.abs(gestureState.dx) : Math.abs(gestureState.dy);
        return dist > 6;
      },
      onPanResponderGrant: () => {
        movedRef.current = false;
      },
      onPanResponderMove: (evt) => {
        movedRef.current = true;
        updateDragFraction(evt);
      },
      onPanResponderRelease: () => {
        if (movedRef.current && dragFractionRef.current !== null) {
          onSeek(dragFractionRef.current);
        }
        dragFractionRef.current = null;
        setDragFraction(null);
      },
      onPanResponderTerminate: () => {
        dragFractionRef.current = null;
        setDragFraction(null);
      },
    })
  ).current;

  const displayProgress = dragFraction !== null ? dragFraction : progress;

  return (
    <View
      style={isHorizontal ? styles.trackHorizontal : styles.trackVertical}
      onLayout={(e) => {
        trackLengthRef.current = isHorizontal ? e.nativeEvent.layout.width : e.nativeEvent.layout.height;
      }}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          isHorizontal ? styles.fillHorizontal : styles.fillVertical,
          isHorizontal ? { width: `${displayProgress * 100}%` } : { height: `${displayProgress * 100}%` },
        ]}
      />
    </View>
  );
}

// Dreimal so breit wie der ursprüngliche, dünne Strich.
const TRACK_THICKNESS = 30;

const styles = StyleSheet.create({
  // Querformat: horizontal ganz unten, Verlauf von links nach rechts.
  // Hochformat: vertikal am rechten Rand, Verlauf von oben nach unten.
  trackHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TRACK_THICKNESS,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'flex-start',
  },
  fillHorizontal: {
    height: '100%',
    backgroundColor: 'rgba(59,130,246,0.85)',
  },
  trackVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: TRACK_THICKNESS,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'flex-start',
  },
  fillVertical: {
    width: '100%',
    backgroundColor: 'rgba(59,130,246,0.85)',
  },
});
