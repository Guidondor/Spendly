import React, { createContext, useCallback, useContext, useState, useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../services/theme';

const AlertContext = createContext({
  alert: () => Promise.resolve(),
  confirm: () => Promise.resolve(null),
});

export function useAlert() {
  return useContext(AlertContext);
}

export function AlertProvider({ children }) {
  const [state, setState] = useState(null);

  const close = useCallback((button) => {
    setState(null);
    button?.onPress?.();
  }, []);

  const alert = useCallback((title, message) => {
    return new Promise(resolve => {
      setState({
        title,
        message,
        buttons: [{ text: 'OK', onPress: () => resolve() }],
      });
    });
  }, []);

  const confirm = useCallback(({ title, message, buttons }) => {
    return new Promise(resolve => {
      const wrapped = (buttons ?? [{ text: 'OK' }]).map(b => ({
        ...b,
        onPress: () => { b.onPress?.(); resolve(b); },
      }));
      setState({ title, message, buttons: wrapped });
    });
  }, []);

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <AlertModal state={state} onClose={close} />
    </AlertContext.Provider>
  );
}

function AlertModal({ state, onClose }) {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const visible = !!state;
  const cancelButton = state?.buttons?.find(b => b.style === 'cancel');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onClose(cancelButton)}
      statusBarTranslucent
    >
      <Pressable style={s.backdrop} onPress={() => onClose(cancelButton)}>
        <Pressable style={s.card} onPress={e => e.stopPropagation?.()}>
          {state?.title ? <Text style={s.title}>{state.title}</Text> : null}
          {state?.message ? <Text style={s.message}>{state.message}</Text> : null}
          <View style={s.buttonRow}>
            {state?.buttons?.map((b, i) => {
              const isDestructive = b.style === 'destructive';
              const isCancel = b.style === 'cancel';
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    s.button,
                    isDestructive && s.buttonDestructive,
                    isCancel && s.buttonCancel,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => onClose(b)}
                >
                  <Text style={[
                    s.buttonText,
                    isDestructive && s.buttonTextDestructive,
                    isCancel && s.buttonTextCancel,
                  ]}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 22,
      borderWidth: theme.dark ? 1 : 0,
      borderColor: theme.cardBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 12,
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 6,
    },
    message: {
      fontSize: 14,
      color: theme.subtext,
      lineHeight: 20,
      marginBottom: 18,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      flexWrap: 'wrap',
    },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.accent,
      minWidth: 80,
      alignItems: 'center',
    },
    buttonDestructive: {
      backgroundColor: theme.expense,
    },
    buttonCancel: {
      backgroundColor: theme.chipBg,
      borderWidth: 1,
      borderColor: theme.chipBorder,
    },
    buttonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    buttonTextDestructive: {
      color: '#fff',
    },
    buttonTextCancel: {
      color: theme.text,
    },
  });
}
