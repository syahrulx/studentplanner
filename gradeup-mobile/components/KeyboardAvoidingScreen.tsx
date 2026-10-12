import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type KeyboardAvoidingViewProps,
} from 'react-native';

type Props = KeyboardAvoidingViewProps & {
  /** Android only: runs after the screen has been lifted, e.g. to scroll a chat to the end. */
  onAndroidKeyboardShow?: () => void;
};

/**
 * KeyboardAvoidingView that also works on Android.
 *
 * Android now draws apps edge-to-edge, so the window no longer shrinks when
 * the keyboard opens and `behavior={undefined}` does nothing: inputs near the
 * bottom sat behind the keyboard and students typed blind (first reported on
 * the AI tutor, Samsung A57). On Android this measures how far the keyboard
 * overlaps this view and pads the bottom by exactly that — zero on a device
 * that does resize, so it never lifts twice. iOS is plain KeyboardAvoidingView.
 *
 * A drop-in for `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>`.
 * Don't use it where a screen already lifts itself on Android (Keyboard
 * listeners, or behavior 'height').
 */
export function KeyboardAvoidingScreen({ style, children, onAndroidKeyboardShow, behavior, ...rest }: Props) {
  const probeRef = useRef<View>(null);
  const [inset, setInset] = useState(0);
  const onShowRef = useRef(onAndroidKeyboardShow);
  onShowRef.current = onAndroidKeyboardShow;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      // The probe fills this view, padding included, so its bottom is the
      // view's bottom whether or not the inset is already applied.
      probeRef.current?.measureInWindow((_x, y, _w, h) => {
        setInset(Math.max(0, Math.round(y + h - keyboardTop)));
        if (onShowRef.current) setTimeout(() => onShowRef.current?.(), 50);
      });
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setInset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (Platform.OS !== 'android') {
    return (
      <KeyboardAvoidingView behavior={behavior} style={style} {...rest}>
        {children}
      </KeyboardAvoidingView>
    );
  }

  const flat = StyleSheet.flatten(style) ?? {};
  const basePadding = [flat.paddingBottom, flat.paddingVertical, flat.padding].find(
    (v): v is number => typeof v === 'number',
  ) ?? 0;

  return (
    <KeyboardAvoidingView style={[style, inset > 0 && { paddingBottom: basePadding + inset }]} {...rest}>
      <View ref={probeRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} />
      {children}
    </KeyboardAvoidingView>
  );
}
