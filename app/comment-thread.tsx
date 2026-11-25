"use client";

import { FormEvent, useState } from "react";
import type { FeedbackComment } from "./store";

function formatCommentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CommentForm({
  label,
  placeholder,
  buttonText,
  onSubmit,
  dense = false,
}: {
  label: string;
  placeholder: string;
  buttonText: string;
  onSubmit: (body: string) => void;
  dense?: boolean;
}) {
  const [body, setBody] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody("");
  }

  return (
    <form className={`comment-form ${dense ? "dense" : ""}`} onSubmit={submit}>
      <label className="field">
        <span>{label}</span>
        <textarea rows={dense ? 2 : 3} value={body} onChange={(event) => setBody(event.target.value)} placeholder={placeholder} />
      </label>
      <button type="submit" className="secondary-button small">
        {buttonText}
      </button>
    </form>
  );
}

function CommentItem({
  comment,
  onReply,
  onUpdateComment,
  onDeleteComment,
  onUpdateReply,
  onDeleteReply,
}: {
  comment: FeedbackComment;
  onReply: (commentId: string, body: string) => void;
  onUpdateComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  onUpdateReply: (commentId: string, replyId: string, body: string) => void;
  onDeleteReply: (commentId: string, replyId: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);

  return (
    <li className="comment-item">
      <div className="comment-main">
        <div className="comment-meta">
          <strong>{comment.author}</strong>
          <span>{formatCommentDate(comment.createdAt)}{comment.updatedAt ? " · 수정됨" : ""}</span>
        </div>
        {editing ? (
          <div className="comment-edit">
            <textarea rows={2} value={editBody} onChange={(event) => setEditBody(event.target.value)} />
            <div className="comment-actions">
              <button
                type="button"
                onClick={() => {
                  onUpdateComment(comment.id, editBody);
                  setEditing(false);
                }}
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditBody(comment.body);
                  setEditing(false);
                }}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <p>{comment.body}</p>
            <div className="comment-actions">
              <button type="button" onClick={() => setReplying((value) => !value)}>
                답글
              </button>
              <button type="button" onClick={() => setEditing(true)}>
                수정
              </button>
              <button type="button" className="danger-action" onClick={() => onDeleteComment(comment.id)}>
                삭제
              </button>
            </div>
          </>
        )}
      </div>
      {comment.replies.length > 0 ? (
        <ul className="reply-list">
          {comment.replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              commentId={comment.id}
              reply={reply}
              onUpdateReply={onUpdateReply}
              onDeleteReply={onDeleteReply}
            />
          ))}
        </ul>
      ) : null}
      {replying ? (
        <CommentForm
          dense
          label="답글"
          placeholder="답글 입력"
          buttonText="답글 등록"
          onSubmit={(body) => {
            onReply(comment.id, body);
            setReplying(false);
          }}
        />
      ) : null}
    </li>
  );
}

function ReplyItem({
  commentId,
  reply,
  onUpdateReply,
  onDeleteReply,
}: {
  commentId: string;
  reply: FeedbackComment["replies"][number];
  onUpdateReply: (commentId: string, replyId: string, body: string) => void;
  onDeleteReply: (commentId: string, replyId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(reply.body);

  return (
    <li>
      <div className="comment-meta">
        <strong>{reply.author}</strong>
        <span>{formatCommentDate(reply.createdAt)}{reply.updatedAt ? " · 수정됨" : ""}</span>
      </div>
      {editing ? (
        <div className="comment-edit">
          <textarea rows={2} value={editBody} onChange={(event) => setEditBody(event.target.value)} />
          <div className="comment-actions">
            <button
              type="button"
              onClick={() => {
                onUpdateReply(commentId, reply.id, editBody);
                setEditing(false);
              }}
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setEditBody(reply.body);
                setEditing(false);
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <p>{reply.body}</p>
          <div className="comment-actions">
            <button type="button" onClick={() => setEditing(true)}>
              수정
            </button>
            <button type="button" className="danger-action" onClick={() => onDeleteReply(commentId, reply.id)}>
              삭제
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export function CommentThread({
  comments,
  emptyText = "등록된 댓글이 없습니다.",
  onComment,
  onReply,
  onUpdateComment,
  onDeleteComment,
  onUpdateReply,
  onDeleteReply,
}: {
  comments: FeedbackComment[];
  emptyText?: string;
  onComment: (body: string) => void;
  onReply: (commentId: string, body: string) => void;
  onUpdateComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  onUpdateReply: (commentId: string, replyId: string, body: string) => void;
  onDeleteReply: (commentId: string, replyId: string) => void;
}) {
  return (
    <section className="comment-section">
      <div className="comment-section-head">
        <h4>댓글</h4>
        <span>{comments.length}개</span>
      </div>
      {comments.length === 0 ? (
        <p className="muted-text">{emptyText}</p>
      ) : (
        <ul className="comment-list">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={onReply}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              onUpdateReply={onUpdateReply}
              onDeleteReply={onDeleteReply}
            />
          ))}
        </ul>
      )}
      <CommentForm label="댓글" placeholder="댓글 입력" buttonText="댓글 등록" onSubmit={onComment} />
    </section>
  );
}
