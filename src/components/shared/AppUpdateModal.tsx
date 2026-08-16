import React, { useState } from 'react';
import { 
  View, Text, Modal, ScrollView, TouchableOpacity, 
  ActivityIndicator, StyleSheet, Alert, Dimensions 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { UpdateCheckResult, downloadAndInstallApk } from '../../updater';
import { ThemedDialog } from './ThemedDialog';

interface AppUpdateModalProps {
  visible: boolean;
  onClose: () => void;
  updateResult: UpdateCheckResult | null;
}

const { width } = Dimensions.get('window');

const AppUpdateModal = ({ visible, onClose, updateResult }: AppUpdateModalProps) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!updateResult) return null;

  const handleStartUpdate = async () => {
    if (!updateResult.apkUrl) {
      setErrorMessage("This release does not contain an APK asset yet.");
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);

    try {
      await downloadAndInstallApk(updateResult.apkUrl, (progress) => {
        setDownloadProgress(progress);
      });
      onClose();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to download update APK.");
    } finally {
      setDownloading(false);
    }
  };

  const formattedSize = updateResult.apkSize 
    ? ` (${(updateResult.apkSize / (1024 * 1024)).toFixed(1)} MB)`
    : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => { if (!downloading) onClose(); }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconContainer}>
            <MaterialCommunityIcons name="update" size={34} color="#E50914" />
          </View>

          <Text style={styles.modalTitle}>{updateResult.releaseName || 'New Update Available!'}</Text>
          <Text style={styles.modalVersionTag}>Version {updateResult.latestVersion}{formattedSize}</Text>

          {updateResult.releaseNotes ? (
            <ScrollView style={styles.modalNotesScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalNotesHeader}>What's New:</Text>
              <Text style={styles.modalNotesText}>{updateResult.releaseNotes}</Text>
            </ScrollView>
          ) : (
            <Text style={styles.modalSubtitle}>
              A new version of Watcher is ready to download and install with new features, performance improvements, and bug fixes.
            </Text>
          )}

          {downloading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>Downloading APK... {Math.round(downloadProgress * 100)}%</Text>
            </View>
          )}

          <View style={styles.modalBtnRow}>
            {!downloading && (
              <TouchableOpacity 
                activeOpacity={0.8} 
                onPress={onClose} 
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Later</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              activeOpacity={0.8} 
              disabled={downloading}
              onPress={handleStartUpdate} 
              style={[styles.modalConfirmBtn, downloading && { opacity: 0.7 }]}
            >
              {downloading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalConfirmText}>Download & Install</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ThemedDialog
        visible={!!errorMessage}
        title="Update Notice"
        message={errorMessage || ''}
        type="warning"
        buttons={[{ text: 'OK', style: 'primary', onPress: () => setErrorMessage(null) }]}
        onClose={() => setErrorMessage(null)}
      />
    </Modal>
  );
};

export default AppUpdateModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: Math.min(width - 40, 380),
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalVersionTag: {
    fontSize: 13,
    color: '#E50914',
    fontFamily: 'GoogleSansFlex-Medium',
    marginBottom: 14,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  modalNotesScroll: {
    maxHeight: 140,
    width: '100%',
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  modalNotesHeader: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: 'GoogleSansFlex-Medium',
    marginBottom: 6,
  },
  modalNotesText: {
    fontSize: 12,
    color: '#BBBBBB',
    lineHeight: 18,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 16,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    fontFamily: 'GoogleSansFlex-Regular',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#E50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Bold',
  },
});
