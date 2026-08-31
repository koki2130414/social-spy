import { z } from 'zod';
import { GAME_PHASES } from '@/lib/types';

export const joinSchema = z.object({
  code: z
    .string()
    .min(4, 'イベントコードを入力してください。')
    .max(16, 'イベントコードが長すぎます。')
    .transform((v) => v.trim().toUpperCase()),
  displayName: z
    .string()
    .trim()
    .min(1, '表示名を入力してください。')
    .max(24, '表示名は24文字以内で入力してください。'),
  affiliation: z
    .string()
    .trim()
    .max(48, '所属・肩書きは48文字以内で入力してください。')
    .optional()
    .or(z.literal('')),
});
export type JoinFormValues = z.infer<typeof joinSchema>;

/** 運営が発行したIDとパスワードでのログイン */
export const participantLoginSchema = z.object({
  code: z
    .string()
    .min(4, 'イベントコードを入力してください。')
    .max(16, 'イベントコードが長すぎます。')
    .transform((v) => v.trim().toUpperCase()),
  loginId: z
    .string()
    .trim()
    .min(4, 'IDを入力してください。')
    .max(24, 'IDが長すぎます。')
    .transform((v) => v.toLowerCase()),
  password: z.string().min(6, 'パスワードを入力してください。').max(64),
});
export type ParticipantLoginValues = z.infer<typeof participantLoginSchema>;

export const missionCompleteSchema = z.object({
  assignmentId: z.string().min(1),
  completed: z.boolean(),
});

export const voteSchema = z.object({
  targetId: z.string().min(1, '投票先を選択してください。'),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().email('メールアドレスの形式が正しくありません。'),
  password: z.string().min(6, 'パスワードは6文字以上です。'),
});
export type AdminLoginValues = z.infer<typeof adminLoginSchema>;

export const eventSchema = z.object({
  name: z.string().trim().min(1, 'イベント名を入力してください。').max(60),
  code: z
    .string()
    .trim()
    .min(4, 'イベントコードは4文字以上です。')
    .max(16)
    .regex(/^[A-Za-z0-9]+$/, '英数字のみ使用できます。')
    .transform((v) => v.toUpperCase()),
  startsAt: z.string().min(1, '開催日時を入力してください。'),
  durationMinutes: z.coerce.number().int().min(10, '10分以上で設定してください。').max(600),
  spyRevealOffsetMinutes: z.coerce.number().int().min(0).max(600),
  spyCount: z.coerce.number().int().min(0, '0以上で設定してください。').max(20),
  registrationOpen: z.boolean(),
});
export type EventFormValues = z.infer<typeof eventSchema>;

export const missionSchema = z.object({
  code: z.string().trim().min(1, '英字コードを入力してください。').max(32),
  title: z.string().trim().min(1, 'タイトルを入力してください。').max(40),
  body: z.string().trim().min(1, '内容を入力してください。').max(200),
  kind: z.enum(['GENERAL', 'SPY']),
  active: z.boolean(),
});
export type MissionFormValues = z.infer<typeof missionSchema>;

export const notificationSchema = z.object({
  title: z.string().trim().min(1, 'タイトルを入力してください。').max(40),
  body: z.string().trim().min(1, '本文を入力してください。').max(300),
  kind: z.enum(['INFO', 'PHASE', 'ALERT', 'CLASSIFIED']),
});
export type NotificationFormValues = z.infer<typeof notificationSchema>;

/** 運営メンバーの招待 */
export const memberInviteSchema = z.object({
  email: z.string().trim().email('メールアドレスの形式が正しくありません。').max(255),
});
export type MemberInviteValues = z.infer<typeof memberInviteSchema>;

export const phaseSchema = z.object({
  to: z.enum(GAME_PHASES),
});

/** 運営が参加者を代理登録するときの入力 */
export const participantCreateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '表示名を入力してください。')
    .max(24, '表示名は24文字以内で入力してください。'),
  affiliation: z
    .string()
    .trim()
    .max(48, '所属・肩書きは48文字以内で入力してください。')
    .optional()
    .or(z.literal('')),
  /** 空なら自動発行する */
  loginId: z
    .string()
    .trim()
    .max(24, 'IDは24文字以内で入力してください。')
    .optional()
    .or(z.literal('')),
});
export type ParticipantCreateValues = z.infer<typeof participantCreateSchema>;

export const spyAssignSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto'), count: z.coerce.number().int().min(0).max(20).optional() }),
  z.object({
    mode: z.literal('manual'),
    participantId: z.string().min(1),
    role: z.enum(['AGENT', 'SPY']),
  }),
]);

const pushEndpoint = z
  .string()
  .url('購読エンドポイントの形式が正しくありません。')
  .max(1024, '購読エンドポイントが長すぎます。');

export const pushSubscribeSchema = z.object({
  endpoint: pushEndpoint,
  p256dh: z.string().min(1, '購読鍵が空です。').max(256),
  auth: z.string().min(1, '購読鍵が空です。').max(256),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: pushEndpoint,
});

export const demoPersonaSchema = z.object({
  persona: z.enum(['agent', 'spy', 'admin']),
});
