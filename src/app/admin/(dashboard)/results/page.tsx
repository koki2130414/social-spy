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

interface AdminResult extends GameResult {
  notVoted: { id: string; displayName: string }[];
  votedCount: number;
  identityRevealed: boolean;
  ballots: { voter: string; target: string; targetIsSpy: boolean }[];
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
          <p className="label-mono">RESULTS</p>
          <h1 className="headline-mono mt-1 text-xl">投票結果</h1>
        </div>
        {data.identityRevealed ? (
          <Badge variant="danger">IDENTITY REVEALED</Badge>
        ) : (
          <Badge variant="outline">未公開</Badge>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="投票済み" value={`${data.votedCount} / ${data.totalParticipants}`} />
        <Tile label="未投票" value={data.notVoted.length} />
        <Tile label="SPYへ投票できた人数" value={data.correctVoters} />
        <Tile label="SPY人数" value={data.spies.length} />
      </div>

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
