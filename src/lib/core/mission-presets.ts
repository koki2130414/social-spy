/**
 * MISSION の初期セット。
 *
 * デモ用のシードデータと、管理画面から新しいイベントを作ったときの初期配置の
 * 両方がここを参照する。文言を変えたい場合はこのファイルだけを直せばよい。
 */

export interface MissionPreset {
  /** 見出し用の英字コード（例: SNS EXCHANGE） */
  code: string;
  title: string;
  body: string;
}

export const GENERAL_MISSION_PRESETS: MissionPreset[] = [
  { code: 'SNS EXCHANGE', title: 'SNS交換', body: '3人の参加者とSNSを交換せよ。' },
  { code: 'COMMON GROUND', title: '共通点の発見', body: '初対面の人と共通点を3つ見つけよ。' },
  {
    code: 'CONNECT PEOPLE',
    title: '橋渡し',
    body: 'まだ話したことがない参加者同士を2人紹介せよ。',
  },
  {
    code: 'NEW FIELD',
    title: '異分野接触',
    body: '自分とは異なるジャンルで活動している人と話せ。',
  },
  { code: 'LOCAL INTEL', title: '現地情報の収集', body: '3人におすすめの店を聞け。' },
  { code: 'FUTURE PLAN', title: '将来計画の聴取', body: '2人に今後挑戦したいことを聞け。' },
  { code: 'FIRST CONTACT', title: '初接触', body: 'これまで話したことがない5人と会話せよ。' },
  { code: 'COLLABORATION', title: '共同作戦', body: '一緒にできそうな企画を誰か一人と考えよ。' },
];

export const SPY_MISSION_PRESETS: MissionPreset[] = [
  {
    code: 'INFORMATION GATHERING',
    title: '情報収集',
    body: '5人以上の参加者から、現在取り組んでいる活動について情報を集めよ。',
  },
  {
    code: 'REPEATED QUESTION',
    title: '反復質問',
    body: '5人の参加者に、最近一番時間を使っていることを質問せよ。',
  },
  { code: 'WIDE CONTACT', title: '広域接触', body: '10人以上の参加者と会話せよ。' },
];

/** 1イベントに用意される初期MISSIONの総数（一般 + SPY） */
export const PRESET_MISSION_COUNT = GENERAL_MISSION_PRESETS.length + SPY_MISSION_PRESETS.length;
