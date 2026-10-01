import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, StyleProp, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { reportsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';

interface ReportCardProps {
  report: {
    reportId?: string;
    type?: string;
    address?: string;
    description?: string;
    status?: string;
    createdAt?: string;
    submitterName?: string;
    photoUrl?: string;
    evidencePhotoUrls?: string[];
    likeCount?: number;
    likedByMe?: boolean;
    comments?: { commentId: string; name: string; text: string; createdAt: string }[];
  };
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

function timeAgo(dateString?: string): string {
  if (!dateString) return '';
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export function ReportCard({ report, onPress, style }: ReportCardProps) {
  const { user } = useAuthStore();
  const [liked, setLiked] = useState(!!report.likedByMe);
  const [likeCount, setLikeCount] = useState(report.likeCount ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState(report.comments ?? []);

  useEffect(() => {
    setLiked(!!report.likedByMe);
    setLikeCount(report.likeCount ?? 0);
    setComments(report.comments ?? []);
  }, [report.likedByMe, report.likeCount, report.comments]);

  async function toggleLike() {
    if (!user) return Alert.alert('Sign in required', 'Sign in to like community reports.');
    if (!report.reportId) return;
    try {
      const result = await reportsApi.toggleLike(report.reportId);
      setLiked(result.data.liked);
      setLikeCount(result.data.likeCount);
    } catch {
      Alert.alert('Could not update like', 'Please try again.');
    }
  }

  async function submitComment() {
    if (!user) return Alert.alert('Sign in required', 'Sign in to comment on community reports.');
    if (!report.reportId || !commentText.trim()) return;
    setSending(true);
    try {
      const result = await reportsApi.addComment(report.reportId, commentText.trim());
      setComments(current => [...current, result.data.comment]);
      setCommentText('');
    } catch {
      Alert.alert('Could not add comment', 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.card, style]}>
      <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} disabled={!onPress}>
        <View style={styles.authorRow}>
          <View style={styles.avatar}><Ionicons name="person" size={16} color={colors.primary} /></View>
          <View style={styles.authorCopy}>
            <Text style={styles.authorName}>{report.submitterName || 'Community member'}</Text>
            <Text style={styles.meta}>{report.type?.replace(/_/g, ' ') || 'Waste report'} · {timeAgo(report.createdAt)}</Text>
          </View>
        </View>
        <Text style={styles.description}>{report.description || 'Reported a waste issue.'}</Text>
        {!!report.address && <Text style={styles.address}>{report.address}</Text>}
      </TouchableOpacity>

      <View style={styles.photos}>
        {!!report.photoUrl && <View style={styles.photoColumn}>
          <Image source={{ uri: report.photoUrl }} style={styles.photo} />
          <Text style={styles.photoLabel}>Reported</Text>
        </View>}
        {(report.evidencePhotoUrls ?? []).map((url, index) => (
          <View style={styles.photoColumn} key={`${url}-${index}`}>
            <Image source={{ uri: url }} style={styles.photo} />
            <Text style={styles.photoLabel}>Completed</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={toggleLike} accessibilityLabel="Like report">
          <MaterialCommunityIcons name={liked ? 'thumb-up' : 'thumb-up-outline'} size={20} color={liked ? '#2563eb' : colors.gray[700]} />
          <Text style={styles.actionText}>{likeCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={() => setShowComments(true)} accessibilityLabel="Comment on report">
          <Ionicons name="chatbubble-outline" size={19} color={colors.gray[700]} />
          <Text style={styles.actionText}>{comments.length}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showComments} transparent animationType="slide" onRequestClose={() => setShowComments(false)}>
        <View style={styles.modalShade}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setShowComments(false)} accessibilityLabel="Close comments">
                <Ionicons name="close" size={23} color={colors.gray[700]} />
              </TouchableOpacity>
            </View>
            {comments.map(comment => (
              <View style={styles.comment} key={comment.commentId}>
                <Text style={styles.commentName}>{comment.name}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
            ))}
            {user ? <View style={styles.commentInputRow}>
              <TextInput value={commentText} onChangeText={setCommentText} placeholder="Write a comment" style={styles.commentInput} maxLength={1000} />
              <TouchableOpacity onPress={submitComment} disabled={sending || !commentText.trim()} accessibilityLabel="Send comment">
                {sending ? <Text style={styles.actionText}>...</Text> : <Ionicons name="send" size={20} color={colors.primary} />}
              </TouchableOpacity>
            </View> : <Text style={styles.signInHint}>Sign in to add a comment.</Text>}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  authorCopy: {
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  meta: {
    fontSize: 11,
    color: colors.gray[500],
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    color: colors.gray[700],
    marginBottom: 4,
    lineHeight: 19,
  },
  address: { fontSize: 12, color: colors.gray[500], marginBottom: 10 },
  photos: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoColumn: { flex: 1, minWidth: 120 },
  photo: { width: '100%', height: 160, borderRadius: 1, backgroundColor: colors.gray[100] },
  photoLabel: { fontSize: 11, color: colors.gray[500], marginTop: 4 },
  actions: { flexDirection: 'row', gap: 24, borderTopWidth: 1, borderTopColor: colors.gray[100], marginTop: 12, paddingTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 12, color: colors.gray[700] },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.white, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 18, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.gray[900] },
  comment: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  commentName: { fontSize: 12, fontWeight: '700', color: colors.gray[900] },
  commentText: { fontSize: 13, color: colors.gray[700], marginTop: 3 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: colors.gray[200], borderRadius: 6, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14 },
  signInHint: { fontSize: 13, color: colors.gray[500], marginTop: 12 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
