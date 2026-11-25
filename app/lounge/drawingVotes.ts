export const DRAWING_VOTE_REWARD = 30;
export const DRAWING_VOTE_MINIMUM = 3;
export type DrawingVote = { voterId: string; targetId: string; at: string };
export type VoteResult = { date: string; topVotes: number; winners: string[]; reward: number; minimum: number };
export type VoteDay = { date: string; revision: number; votes: DrawingVote[]; closed: boolean; rewardsCompleted: boolean; result?: VoteResult; settledAt?: string; winnerNames?: Record<string,string>; payouts?: Record<string,{date:string;amount:number|null;at:string|null;skipped?:boolean}> };

export function voteResult(day: Pick<VoteDay, "date" | "votes">): VoteResult {
  const counts = new Map<string, number>();
  // One voter has one effective vote, even if a legacy row contains duplicates.
  for (const vote of Array.from(new Map(day.votes.map(v => [v.voterId, v])).values())) {
    if (vote.voterId !== vote.targetId) counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1);
  }
  const topVotes = Math.max(0, ...Array.from(counts.values()));
  return {date: day.date, topVotes, winners: topVotes >= DRAWING_VOTE_MINIMUM ? Array.from(counts).filter(([, count]) => count === topVotes).map(([id]) => id).sort() : [], reward: DRAWING_VOTE_REWARD, minimum: DRAWING_VOTE_MINIMUM};
}

export function castDrawingVote(day: VoteDay, voterId: string, targetId: string, today: string, at: string): VoteDay {
  if (day.closed || day.date !== today) throw new Error("투표가 마감되었습니다.");
  if (voterId === targetId) throw new Error("자신의 그림에는 투표할 수 없습니다.");
  return {...day, revision: day.revision + 1, votes: [...day.votes.filter(v => v.voterId !== voterId), {voterId, targetId, at}]};
}

export function newestVoteSummary<T extends {date:string;revision:number}>(previous:T|null,incoming:T,date:string):T|null {
  if(incoming.date!==date)return previous;
  return previous&&previous.date===date&&previous.revision>incoming.revision?previous:incoming;
}

export function drawingVoteLeaders(counts:Record<string,number>,eligibleIds:string[]) {
  const valid=eligibleIds.filter(id=>Number.isSafeInteger(counts[id])&&counts[id]>0);
  const highest=Math.max(0,...valid.map(id=>counts[id]));
  return new Set(valid.filter(id=>counts[id]===highest));
}
