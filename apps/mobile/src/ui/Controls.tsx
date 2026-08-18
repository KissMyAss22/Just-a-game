import { useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { cameraState, moveInput } from '../state/position';
import { theme } from './theme';

const STICK_RADIUS = 58;
const KNOB_RADIUS = 26;

/**
 * De joystick schrijft rechtstreeks in `moveInput` en beweegt zijn knop met
 * Animated.ValueXY. Zo is er geen enkele re-render tijdens het lopen.
 */
export function Joystick() {
  const knob = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin(() => {
      moveInput.active = true;
    })
    .onUpdate((event) => {
      let dx = event.translationX;
      let dy = event.translationY;
      const distance = Math.hypot(dx, dy);
      if (distance > STICK_RADIUS) {
        dx = (dx / distance) * STICK_RADIUS;
        dy = (dy / distance) * STICK_RADIUS;
      }
      knob.setValue({ x: dx, y: dy });
      moveInput.x = dx / STICK_RADIUS;
      // Op het scherm is omhoog negatief, in het spel is vooruit positief.
      moveInput.y = -dy / STICK_RADIUS;
    })
    .onFinalize(() => {
      knob.setValue({ x: 0, y: 0 });
      moveInput.x = 0;
      moveInput.y = 0;
      moveInput.active = false;
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.stickArea}>
        <View style={styles.stickBase}>
          <Animated.View
            style={[styles.knob, { transform: [{ translateX: knob.x }, { translateY: knob.y }] }]}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

/**
 * Slepen op de rechterhelft draait de camera; knijpen zoomt in en uit.
 * Beide schrijven in `cameraState`, dat de PlayerRig elke frame uitleest.
 */
export function LookControl() {
  const startYaw = useRef(cameraState.yaw);
  const startDistance = useRef(cameraState.distance);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      startYaw.current = cameraState.yaw;
    })
    .onUpdate((event) => {
      cameraState.yaw = startYaw.current - event.translationX * 0.006;
      const height = 9 - event.translationY * 0.03;
      cameraState.height = Math.max(4, Math.min(28, height));
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      startDistance.current = cameraState.distance;
    })
    .onUpdate((event) => {
      cameraState.distance = Math.max(7, Math.min(40, startDistance.current / event.scale));
    });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <View style={styles.lookArea} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  stickArea: {
    position: 'absolute',
    left: 16,
    bottom: 28,
    width: STICK_RADIUS * 2 + 40,
    height: STICK_RADIUS * 2 + 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickBase: {
    width: STICK_RADIUS * 2,
    height: STICK_RADIUS * 2,
    borderRadius: STICK_RADIUS,
    backgroundColor: 'rgba(16, 24, 45, 0.45)',
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    width: KNOB_RADIUS * 2,
    height: KNOB_RADIUS * 2,
    borderRadius: KNOB_RADIUS,
    backgroundColor: 'rgba(77, 212, 172, 0.75)',
    borderWidth: 2,
    borderColor: 'rgba(232, 237, 249, 0.5)',
  },
  lookArea: {
    position: 'absolute',
    right: 0,
    top: 90,
    bottom: 150,
    width: '50%',
  },
});
