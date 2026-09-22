'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdmin } from '@/components/spy/admin-shell';
import { useAdminResource } from '@/hooks/use-admin-resource';
import type { GameResult } from '@/lib/types';
import type { FinalRankingRow } from '@/lib/core/final-score';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { downloadTextFile } from '@/lib/download-csv';

interface AdminResult extends GameResult {
  notVoted: { id: string; displayName: string }[];
  votedCount: number;
  ballotCount: number;
  identityRevealed: boolean;
  ballots: { voter: string; target: string; targetIsSpy: boolean }[];
  finalRanking: FinalRankingRow[];
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <p className="label-mono">{label}</p>
      <p className="mt-1 font-mono text-2xl text-foreground">{value}</p>
    </div>
  );
}

export default function AdminResultsPage() {
  const { eventId } = useAdmin();
  const { data, loading, error } = useAdminResource<AdminResult>(
    eventId ? `/api/admin/events/${eventId}/results` : null,
    6000,
  );

  /** 表彰の読み上げ用に手元へ落とす。ファイル名は半角英数字にする */
  const downloadFinalCsv = () => {
    const header = '順位,名前,所属・肩書き,達成率,SPY的中,選んだ人数,ポイント';
    const lines = (data?.finalRanking ?? []).map((r) =>
      [
        r.rank,
        `"${r.displayName.replace(/"/g, '""')}"`,
        `"${(r.affiliation ?? '').replace(/"/g, '""')}"`,
        `${r.percent}%`,
        r.correctSpies,
        r.picked,
        r.points.toFixed(2),
      ].join(','),
    );
    downloadTextFile('final-ranking.csv', '\uFEFF' + [header, ...lines].join('\r\n'));
  };

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">イベントを選択してください。</p>;
  }
  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
        {error ?? 'データを取得できませんでした。'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono">投票結果</p>
          <h1 className="headline-mono mt-1 text-xl">得票とSPYの正体</h1>
        </div>
        {data.identityRevealed ? (
          <Badge variant="danger">参加者に公開済み</Badge>
        ) : (
          <Badge variant="outline">未公開</Badge>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="投票済み" value={`${data.votedCount} / ${data.totalParticipants}`} />
        <Tile label="投じられた票" value={data.ballotCount} />
        <Tile
          label="SPYを当てた人"
          value={data.finalRanking.filter((r) => r.correctSpies > 0).length}
        />
        <Tile label="SPY人数" value={data.spies.length} />
      </div>

      {/* 表彰用。達成率とSPY正解を合わせた総合順位 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="label-mono">総合順位（表彰用）</p>
            <p className="mt-1 text-xs text-muted-foreground">
              クエスト達成率100%で1.00pt、SPYを1人当てるごとに1.00pt。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={downloadFinalCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            CSV
          </Button>
        </div>
        <div className="rounded-sm border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>順位</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>所属・肩書き</TableHead>
                <TableHead>達成率</TableHead>
                <TableHead>SPY的中</TableHead>
                <TableHead>選んだ人数</TableHead>
                <TableHead>ポイント</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.finalRanking.map((r) => (
                <TableRow key={r.participantId}>
                  <TableCell className="font-mono text-base font-bold tabular-nums text-foreground">
                    {r.rank}
                  </TableCell>
                  <TableCell className="text-foreground">{r.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.affiliation ?? '-'}</TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">
                    {r.percent}%
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-amber">
                    {r.correctSpies}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">
                    {r.picked}
                  </TableCell>
                  <TableCell className="font-mono text-base tabular-nums text-intel">
                    {r.points.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {data.finalRanking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    集計対象がいません。
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <p className="label-mono mb-3">得票数</p>
        <div className="rounded-sm border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>所属・肩書き</TableHead>
                <TableHead>役割</TableHead>
                <TableHead>得票数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.participantId}>
                  <TableCell className="text-foreground">{r.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.affiliation ?? '-'}</TableCell>
                  <TableCell>
                    {r.isSpy ? (
                      <Badge variant="danger">SPY</Badge>
                    ) : (
                      <Badge variant="outline">AGENT</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-amber">{r.votes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <p className="label-mono mb-3">未投票者</p>
        {data.notVoted.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            全員が投票済みです。
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.notVoted.map((p) => (
              <li key={p.id}>
                <Badge variant="outline">{p.displayName}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <p className="label-mono mb-3">投票結果一覧</p>
        <div className="rounded-sm border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>投票した人</TableHead>
                <TableHead>投票先</TableHead>
                <TableHead>判定</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ballots.map((b, i) => (
                <TableRow key={`${b.voter}-${i}`}>
                  <TableCell className="text-foreground">{b.voter}</TableCell>
                  <TableCell className="text-foreground">{b.target}</TableCell>
                  <TableCell>
                    {b.targetIsSpy ? (
                      <Badge variant="intel">的中</Badge>
                    ) : (
                      <Badge variant="outline">外れ</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.ballots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    まだ投票はありません。
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
