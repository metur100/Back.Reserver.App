import { StyleSheet, View } from 'react-native';
import type { OrderHistoryDto } from '@/api/types';
import { de } from '@/i18n/de';
import { colors, spacing } from '@/theme';
import { formatDateTimeShort } from '@/utils/format';
import { AppText, Icon } from '../ui';

/** True for history entries that record a note (e.g. a pickup problem) without a status change. */
export function isNoteEntry(entry: OrderHistoryDto): boolean {
  return entry.fromStatus !== null && entry.fromStatus === entry.toStatus;
}

export function OrderHistory({ history }: { history: OrderHistoryDto[] }) {
  const entries = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <View style={styles.list}>
      {entries.map((h, i) => {
        const note = isNoteEntry(h);
        const who = [de.staff.actor[h.actor] ?? h.actor, h.changedByName ? de.staff.historyBy(h.changedByName) : null].filter(Boolean).join(' ');
        const title = note
          ? de.staff.historyNote
          : h.fromStatus
            ? `${de.staffStatus[h.fromStatus]} → ${de.staffStatus[h.toStatus]}`
            : de.staffStatus[h.toStatus];
        return (
          <View key={`${h.createdAt}-${i}`} style={styles.row} accessible testID={note ? 'history-note' : 'history-status'}>
            <View style={[styles.dot, note && styles.noteDot]}>
              <Icon name={note ? 'warning' : 'ellipse'} size={note ? 14 : 8} color={note ? colors.warning : colors.accentText} />
            </View>
            <View style={styles.flex}>
              <AppText variant="label">{title}</AppText>
              {h.note ? (
                <View style={note ? styles.noteBox : undefined}>
                  <AppText color={note ? colors.warning : colors.text}>{h.note}</AppText>
                </View>
              ) : null}
              <AppText variant="caption">
                {formatDateTimeShort(h.createdAt)} · {who}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  noteDot: { backgroundColor: colors.warningSoft },
  flex: { flex: 1, gap: 2 },
  noteBox: { backgroundColor: colors.warningSoft, borderRadius: 8, padding: spacing.sm, marginVertical: 2 },
});
