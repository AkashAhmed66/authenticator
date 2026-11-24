import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { deleteAccount, getSecret, loadAccounts, saveAccount } from './src/services/storage';
import { generateOtp, getTimeState, parseOtpAuthUri, validateSecret } from './src/services/totp';
import type { Account, AccountDraft } from './src/types/account';

const colors = {
  background: '#070A12',
  surface: '#111625',
  surfaceRaised: '#171D2F',
  surfaceSoft: '#202942',
  ink: '#F6F7FB',
  muted: '#98A2B8',
  subtle: '#66708B',
  line: '#252E45',
  blue: '#6C7CFF',
  violet: '#A67CFF',
  cyan: '#6FE7FF',
  danger: '#FF7D8A',
  white: '#FFFFFF',
};

const emptyDraft: AccountDraft = {
  issuer: '',
  accountName: '',
  algorithm: 'sha1',
  digits: 6,
  period: 30,
  secret: '',
};

type Dialog = { title: string; message: string; action?: string; onAction?: () => void };

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  const refresh = async () => {
    const stored = await loadAccounts();
    const loaded: Record<string, string> = {};
    for (const account of stored) loaded[account.id] = await getSecret(account.id);
    setAccounts(stored);
    setSecrets(loaded);
  };

  useEffect(() => {
    refresh().catch((error: unknown) => setDialog({ title: 'Unable to load accounts', message: error instanceof Error ? error.message : 'Try again.' }));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(
    () => accounts.filter((account) => `${account.issuer} ${account.accountName}`.toLowerCase().includes(query.toLowerCase())),
    [accounts, query],
  );
  const theme = darkMode ? darkTheme : lightTheme;

  const copyOtp = async (otp: string) => {
    await Clipboard.setStringAsync(otp);
    setDialog({ title: 'Code copied', message: 'Your one-time password is ready to paste.' });
  };

  const confirmDelete = (account: Account) => setDialog({
    title: `Remove ${account.issuer}?`,
    message: 'This account and its secure secret will be permanently removed from this device.',
    action: 'Remove account',
    onAction: () => deleteAccount(account.id).then(refresh).catch((error: unknown) => setDialog({ title: 'Could not remove account', message: String(error) })),
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <View style={[styles.header, { borderBottomColor: theme.line }]}>
        <View>
          <View style={styles.brandLine}><View style={styles.brandMark}><Text style={styles.brandMarkText}>A</Text></View><Text style={[styles.eyebrow, { color: theme.muted }]}>AUTHENTICATOR</Text></View>
          <Text style={[styles.title, { color: theme.ink }]}>One-time codes</Text>
        </View>
        <Pressable accessibilityLabel="Theme settings" style={[styles.iconButton, { backgroundColor: theme.surface }]} onPress={() => setShowTheme(true)}>
          <Text style={[styles.themeButtonText, { color: theme.ink }]}>Theme</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.statusRow}><View style={styles.liveDot} /><Text style={[styles.statusText, { color: theme.muted }]}>Stored securely on this device</Text></View>
        <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Find an account" placeholderTextColor={theme.subtle} style={[styles.search, { color: theme.ink }]} />
          {query.length > 0 && <Pressable onPress={() => setQuery('')}><Text style={[styles.clear, { color: theme.muted }]}>×</Text></Pressable>}
        </View>
        <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.ink }]}>Accounts</Text><Text style={[styles.count, { color: theme.muted }]}>{accounts.length.toString().padStart(2, '0')}</Text></View>

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyOrb}><Text style={styles.emptyOrbText}>A</Text></View>
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>{query ? 'No matches' : 'No accounts yet'}</Text>
            <Text style={[styles.emptyText, { color: theme.muted }]}>{query ? 'Try another issuer or account name.' : 'Add your first account to start generating secure codes offline.'}</Text>
            {!query && <Pressable style={styles.emptyAction} onPress={() => setShowAdd(true)}><Text style={styles.emptyActionText}>Add first account  →</Text></Pressable>}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => {
              const { remaining, progress } = getTimeState(item.period, now);
              let otp = '------';
              try { if (secrets[item.id]) otp = generateOtp(item, secrets[item.id]); } catch { otp = 'ERROR'; }
              return <AccountCard account={item} otp={otp} remaining={remaining} progress={progress} index={index} theme={theme} onCopy={() => copyOtp(otp)} onDelete={() => confirmDelete(item)} />;
            }}
          />
        )}
      </View>

      <Pressable accessibilityRole="button" style={styles.floatingAdd} onPress={() => setShowAdd(true)}>
        <Text style={styles.floatingPlus}>＋</Text><Text style={styles.floatingText}>Add account</Text>
      </Pressable>

      <AddAccountModal visible={showAdd} onClose={() => setShowAdd(false)} onSaved={refresh} onScan={() => { setShowAdd(false); setShowScanner(true); }} onError={setDialog} />
      <ScannerModal visible={showScanner} onClose={() => setShowScanner(false)} onSaved={refresh} onError={setDialog} />
      <ThemeModal visible={showTheme} darkMode={darkMode} onClose={() => setShowTheme(false)} onSelect={(value) => { setDarkMode(value); setShowTheme(false); }} />
      <DialogModal dialog={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

function AccountCard({ account, otp, remaining, progress, index, theme, onCopy, onDelete }: { account: Account; otp: string; remaining: number; progress: number; index: number; theme: Theme; onCopy: () => void; onDelete: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: index % 2 === 0 ? '#20294D' : '#2A204A' }]}><Text style={styles.avatarText}>{account.issuer.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.accountCopy}><Text style={[styles.issuer, { color: theme.ink }]}>{account.issuer}</Text><Text style={[styles.accountName, { color: theme.muted }]} numberOfLines={1}>{account.accountName}</Text></View>
        <Pressable accessibilityLabel={`Remove ${account.issuer}`} hitSlop={12} onPress={onDelete}><Text style={[styles.more, { color: theme.muted }]}>Remove</Text></Pressable>
      </View>
      <View style={styles.otpRow}><Text style={[styles.otp, { color: theme.ink }]}>{otp.slice(0, Math.ceil(otp.length / 2))} <Text style={{ color: colors.blue }}>{otp.slice(Math.ceil(otp.length / 2))}</Text></Text><Pressable accessibilityRole="button" style={styles.copyButton} onPress={onCopy}><Text style={styles.copyText}>Copy</Text></Pressable></View>
      <View style={styles.progressRow}><View style={[styles.progressTrack, { backgroundColor: theme.line }]}><View style={[styles.progress, { width: `${progress * 100}%` }]} /></View><Text style={[styles.expires, { color: remaining <= 5 ? colors.danger : theme.muted }]}>{remaining}s</Text></View>
    </View>
  );
}

function AddAccountModal({ visible, onClose, onSaved, onScan, onError }: { visible: boolean; onClose: () => void; onSaved: () => Promise<void>; onScan: () => void; onError: (dialog: Dialog) => void }) {
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const update = (key: keyof AccountDraft, value: string) => setDraft((current) => ({ ...current, [key]: key === 'digits' || key === 'period' ? Number(value) : value } as AccountDraft));
  const submit = async () => {
    if (!draft.issuer.trim() || !draft.accountName.trim() || !validateSecret(draft.secret)) {
      onError({ title: 'Check the setup key', message: 'Add an issuer, account name, and a valid Base32 setup key before saving.' });
      return;
    }
    try { await saveAccount({ ...draft, issuer: draft.issuer.trim(), accountName: draft.accountName.trim() }); await onSaved(); onClose(); setDraft(emptyDraft); }
    catch (error) { onError({ title: 'Could not save account', message: error instanceof Error ? error.message : 'Secure storage is unavailable.' }); }
  };
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><SafeAreaView style={styles.modalSafe}><KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.sheetHandle} /><View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>ADD ACCOUNT</Text><Text style={styles.modalTitle}>Add account</Text></View><Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View><Text style={styles.modalSubtitle}>Scan a setup QR code or enter the details below.</Text><Pressable style={styles.scanChoice} onPress={onScan}><View style={styles.scanIcon}><Text style={styles.scanIconText}>QR</Text></View><View style={styles.choiceCopy}><Text style={styles.choiceTitle}>Scan QR code</Text><Text style={styles.choiceSubtitle}>Automatically fill account details</Text></View><Text style={styles.choiceArrow}>›</Text></Pressable><View style={styles.divider}><Text style={styles.dividerText}>MANUAL SETUP</Text></View><Field label="Issuer" value={draft.issuer} onChangeText={(value) => update('issuer', value)} placeholder="GitHub, Google, Microsoft…" /><Field label="Account name" value={draft.accountName} onChangeText={(value) => update('accountName', value)} placeholder="you@example.com" /><Field label="Secret key" value={draft.secret} onChangeText={(value) => update('secret', value)} placeholder="Base32 setup key" autoCapitalize="characters" /><Text style={styles.label}>Algorithm</Text><View style={styles.optionRow}><Option label="SHA-1" selected={draft.algorithm === 'sha1'} onPress={() => update('algorithm', 'sha1')} /><Option label="SHA-256" selected={draft.algorithm === 'sha256'} onPress={() => update('algorithm', 'sha256')} /><Option label="SHA-512" selected={draft.algorithm === 'sha512'} onPress={() => update('algorithm', 'sha512')} /></View><Pressable style={styles.saveButton} onPress={submit}><Text style={styles.saveButtonText}>Save account</Text></Pressable></KeyboardAvoidingView></SafeAreaView></Modal>;
}

function ScannerModal({ visible, onClose, onSaved, onError }: { visible: boolean; onClose: () => void; onSaved: () => Promise<void>; onError: (dialog: Dialog) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [pulse] = useState(new Animated.Value(0));
  const scanningRef = useRef(false);

  useEffect(() => {
    if (!visible) { setScanned(false); scanningRef.current = false; return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 1600, useNativeDriver: true })]));
    animation.start();
    return () => animation.stop();
  }, [visible, pulse]);

  const handleScan = async (data: string) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    try {
      const draft = parseOtpAuthUri(data);
      await saveAccount(draft);
      await onSaved();
      setScanned(true);
      setTimeout(onClose, 850);
    } catch (error) {
      scanningRef.current = false;
      onError({ title: 'QR code not supported', message: error instanceof Error ? error.message : 'Point the camera at a valid authenticator QR code.' });
    }
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.scannerSafe}><View style={styles.scanner}><View style={styles.scannerTop}><Pressable onPress={onClose} style={styles.scannerClose}><Text style={styles.scannerCloseText}>×</Text></Pressable><View><Text style={styles.modalEyebrow}>SCAN ACCOUNT</Text><Text style={styles.scannerTitle}>Scan a QR code</Text></View><View style={{ width: 42 }} /></View>{permission?.granted ? <><View style={styles.viewfinder}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => handleScan(data)} /><View style={styles.dimOverlay} /><View style={styles.cornerFrame}><View style={[styles.corner, styles.cornerTL]} /><View style={[styles.corner, styles.cornerTR]} /><View style={[styles.corner, styles.cornerBL]} /><View style={[styles.corner, styles.cornerBR]} /><Animated.View style={[styles.scanBeam, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }), transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [-100, 100] }) }] }]} /></View>{scanned ? <View style={styles.scanSuccess}><Text style={styles.scanSuccessIcon}>✓</Text><Text style={styles.scanSuccessText}>Account added</Text></View> : <Text style={styles.scanInstruction}>Place the QR code inside the frame</Text>}</View><View style={styles.scannerFooter}><View style={styles.privacyBadge}><Text style={styles.privacyText}>The QR code is processed on this device.</Text></View></View></> : <View style={styles.permissionState}><Text style={styles.permissionIcon}>QR</Text><Text style={styles.permissionTitle}>Camera access needed</Text><Text style={styles.permissionText}>Allow camera access to scan an authenticator QR code.</Text><Pressable style={styles.saveButton} onPress={() => requestPermission()}><Text style={styles.saveButtonText}>Allow camera</Text></Pressable></View>}</View></SafeAreaView></Modal>;
}

function ThemeModal({ visible, darkMode, onClose, onSelect }: { visible: boolean; darkMode: boolean; onClose: () => void; onSelect: (dark: boolean) => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><SafeAreaView style={styles.modalSafe}><View style={styles.dialogBackdrop}><View style={styles.themeDialog}><Text style={styles.modalEyebrow}>APPEARANCE</Text><Text style={styles.dialogTitle}>Theme</Text><Text style={styles.dialogMessage}>Choose how the app should look.</Text><View style={styles.themeOptions}><Pressable style={[styles.themeOption, darkMode && styles.themeOptionSelected]} onPress={() => onSelect(true)}><Text style={styles.themeSwatchDark}>●</Text><Text style={styles.themeOptionText}>Dark</Text><Text style={styles.themeCheck}>{darkMode ? '✓' : ''}</Text></Pressable><Pressable style={[styles.themeOption, !darkMode && styles.themeOptionSelected]} onPress={() => onSelect(false)}><Text style={styles.themeSwatchLight}>●</Text><Text style={styles.themeOptionText}>Light</Text><Text style={styles.themeCheck}>{!darkMode ? '✓' : ''}</Text></Pressable></View><Pressable onPress={onClose} style={styles.dialogCancel}><Text style={styles.dialogCancelText}>Close</Text></Pressable></View></View></SafeAreaView></Modal>;
}

function DialogModal({ dialog, onClose }: { dialog: Dialog | null; onClose: () => void }) {
  if (!dialog) return null;
  const action = dialog.onAction;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><SafeAreaView style={styles.modalSafe}><View style={styles.dialogBackdrop}><View style={styles.themeDialog}><View style={styles.dialogIcon}><Text style={styles.dialogIconText}>{action ? '!' : '✓'}</Text></View><Text style={styles.dialogTitle}>{dialog.title}</Text><Text style={styles.dialogMessage}>{dialog.message}</Text><View style={styles.dialogActions}>{action && <Pressable onPress={() => { onClose(); action(); }} style={styles.destructiveButton}><Text style={styles.destructiveText}>{dialog.action}</Text></Pressable>}<Pressable onPress={onClose} style={[styles.dialogCancel, !action && styles.dialogPrimary]}><Text style={[styles.dialogCancelText, !action && styles.dialogPrimaryText]}>{action ? 'Cancel' : 'Done'}</Text></Pressable></View></View></View></SafeAreaView></Modal>;
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; autoCapitalize?: 'none' | 'characters' }) {
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput {...props} style={styles.input} placeholderTextColor={colors.subtle} /></View>;
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.option, selected && styles.optionSelected]}><Text style={selected ? styles.optionTextSelected : styles.optionText}>{label}</Text></Pressable>;
}

type Theme = { background: string; surface: string; ink: string; muted: string; subtle: string; line: string };
const darkTheme: Theme = { background: colors.background, surface: colors.surface, ink: colors.ink, muted: colors.muted, subtle: colors.subtle, line: colors.line };
const lightTheme: Theme = { background: '#F5F7FC', surface: '#FFFFFF', ink: '#111827', muted: '#667085', subtle: '#98A2B3', line: '#E4E7EC' };

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 22, borderBottomWidth: 1 }, brandLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandMark: { width: 20, height: 20, borderRadius: 6, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: colors.white, fontSize: 12 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8 }, title: { fontSize: 36, fontWeight: '900', letterSpacing: -1.5, marginTop: 10 }, iconButton: { width: 72, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, themeButtonText: { fontSize: 13, fontWeight: '800' }, icon: { fontSize: 21 }, content: { flex: 1, paddingHorizontal: 20 }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 14 }, liveDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: colors.cyan }, statusText: { fontSize: 12, fontWeight: '600' }, searchWrap: { height: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 }, searchIcon: { fontSize: 25, marginRight: 8 }, search: { flex: 1, fontSize: 15 }, clear: { fontSize: 23 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 10 }, sectionTitle: { fontSize: 21, fontWeight: '800' }, count: { fontSize: 12, fontWeight: '700' }, list: { paddingBottom: 120, gap: 12 }, card: { borderWidth: 1, borderRadius: 24, padding: 18 }, cardHeader: { flexDirection: 'row', alignItems: 'center' }, avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.violet, fontWeight: '900', fontSize: 18 }, accountCopy: { flex: 1, marginLeft: 12 }, issuer: { fontWeight: '800', fontSize: 16 }, accountName: { marginTop: 4, fontSize: 13 }, more: { fontWeight: '800', fontSize: 12 }, otpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }, otp: { fontSize: 31, fontWeight: '900', letterSpacing: 4 }, copyButton: { backgroundColor: '#252D56', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 }, copyText: { color: '#AAB4FF', fontWeight: '800', fontSize: 12 }, progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }, progressTrack: { flex: 1, height: 5, borderRadius: 4, overflow: 'hidden' }, progress: { height: '100%', backgroundColor: colors.blue, borderRadius: 4 }, expires: { fontSize: 12, fontWeight: '700', width: 28 }, empty: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 35, paddingBottom: 80 }, emptyOrb: { width: 90, height: 90, borderRadius: 32, backgroundColor: '#1C2550', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }, emptyOrbText: { color: colors.cyan, fontSize: 38 }, emptyTitle: { fontSize: 23, fontWeight: '900' }, emptyText: { textAlign: 'center', lineHeight: 21, marginTop: 10 }, emptyAction: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 13, backgroundColor: colors.blue }, emptyActionText: { color: colors.white, fontWeight: '800' }, floatingAdd: { position: 'absolute', bottom: 20, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, height: 56, borderRadius: 18, backgroundColor: colors.blue, shadowColor: colors.blue, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 }, floatingPlus: { color: colors.white, fontSize: 23 }, floatingText: { color: colors.white, fontSize: 15, fontWeight: '900' }, modalSafe: { flex: 1 }, sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.line, marginBottom: 24 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, modalEyebrow: { color: colors.violet, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 }, modalTitle: { color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: 7 }, closeButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.muted, fontSize: 25 }, modalSubtitle: { color: colors.muted, marginTop: 8, marginBottom: 20 }, scanChoice: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, backgroundColor: '#1A2142', borderWidth: 1, borderColor: '#343D70' }, scanIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, scanIconText: { color: colors.white, fontSize: 17, fontWeight: '900' }, choiceCopy: { flex: 1, marginLeft: 13 }, choiceTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 }, choiceSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 }, choiceArrow: { color: colors.cyan, fontSize: 22 }, divider: { alignItems: 'center', marginVertical: 20 }, dividerText: { color: colors.subtle, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, field: { marginBottom: 13 }, label: { color: colors.muted, fontSize: 12, fontWeight: '800', marginBottom: 7 }, input: { height: 48, borderColor: colors.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, color: colors.ink, fontSize: 15, backgroundColor: colors.surfaceRaised }, optionRow: { flexDirection: 'row', gap: 8, marginTop: 1 }, option: { borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 11, borderRadius: 11 }, optionSelected: { backgroundColor: '#252D56', borderColor: colors.blue }, optionText: { color: colors.muted, fontSize: 12 }, optionTextSelected: { color: '#B8C0FF', fontWeight: '800', fontSize: 12 }, saveButton: { backgroundColor: colors.blue, borderRadius: 15, padding: 16, alignItems: 'center', marginTop: 22 }, saveButtonText: { color: colors.white, fontWeight: '900', fontSize: 15 }, scannerSafe: { flex: 1, backgroundColor: colors.background }, scanner: { flex: 1, paddingHorizontal: 20, paddingTop: 14 }, scannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, scannerClose: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, scannerCloseText: { color: colors.ink, fontSize: 25 }, scannerTitle: { color: colors.ink, fontSize: 25, fontWeight: '900', textAlign: 'center', marginTop: 5 }, viewfinder: { height: 470, borderRadius: 28, overflow: 'hidden', position: 'relative', backgroundColor: '#05060B' }, dimOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.28)' }, cornerFrame: { position: 'absolute', left: 28, right: 28, top: 100, bottom: 100 }, corner: { width: 42, height: 42, position: 'absolute', borderColor: colors.cyan }, cornerTL: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 12 }, cornerTR: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 12 }, cornerBL: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 12 }, cornerBR: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 12 }, scanBeam: { position: 'absolute', left: 0, right: 0, top: '50%', height: 2, backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.9, shadowRadius: 8 }, scanInstruction: { position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: colors.white, fontWeight: '700', fontSize: 13 }, scanSuccess: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }, scanSuccessIcon: { color: colors.cyan, fontSize: 28, fontWeight: '900' }, scanSuccessText: { color: colors.white, fontWeight: '800', marginTop: 4 }, scannerFooter: { alignItems: 'center', marginTop: 24 }, privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surface }, privacyIcon: { color: colors.cyan, fontSize: 18 }, privacyText: { color: colors.muted, fontSize: 12 }, permissionState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, permissionIcon: { color: colors.cyan, fontSize: 56 }, permissionTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', marginTop: 20 }, permissionText: { color: colors.muted, lineHeight: 21, textAlign: 'center', marginTop: 10 }, dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.66)', justifyContent: 'center', padding: 22 }, themeDialog: { backgroundColor: colors.surface, borderRadius: 26, padding: 24, borderWidth: 1, borderColor: colors.line }, dialogIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#252D56', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, dialogIconText: { color: colors.cyan, fontSize: 22, fontWeight: '900' }, dialogTitle: { color: colors.ink, fontSize: 23, fontWeight: '900' }, dialogMessage: { color: colors.muted, lineHeight: 21, marginTop: 8 }, dialogActions: { flexDirection: 'row', gap: 10, marginTop: 24 }, destructiveButton: { flex: 1, borderRadius: 13, backgroundColor: '#492331', padding: 14, alignItems: 'center' }, destructiveText: { color: colors.danger, fontWeight: '900', fontSize: 13 }, dialogCancel: { flex: 1, borderRadius: 13, padding: 14, alignItems: 'center', backgroundColor: colors.surfaceRaised }, dialogCancelText: { color: colors.muted, fontWeight: '800', fontSize: 13 }, dialogPrimary: { backgroundColor: colors.blue }, dialogPrimaryText: { color: colors.white }, themeOptions: { gap: 10, marginTop: 20 }, themeOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line }, themeOptionSelected: { borderColor: colors.blue, backgroundColor: '#252D56' }, themeSwatchDark: { color: colors.blue, fontSize: 20 }, themeSwatchLight: { color: '#F4B860', fontSize: 20 }, themeOptionText: { color: colors.ink, fontWeight: '800', marginLeft: 12, flex: 1 }, themeCheck: { color: colors.cyan, fontWeight: '900' },
});
