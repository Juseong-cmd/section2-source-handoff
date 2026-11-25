import type {ReactNode} from "react";
export function DrawingCollectionState({kind,title,children,action}: {kind:"loading"|"empty"|"error";title:string;children?:ReactNode;action?:ReactNode}) {
  return <div className={`drawing-collection-state ${kind}${action?" has-action":""}`} role={kind==="error"?"alert":"status"}>
    <span className="drawing-collection-state-icon" aria-hidden="true">{kind==="loading"?<span className="drawing-loading-bars"><i/><i/><i/></span>:kind==="error"?"!":"◇"}</span>
    <div className="drawing-collection-state-copy"><strong>{title}</strong>{children&&<p>{children}</p>}</div>
    {action&&<div className="drawing-collection-state-action">{action}</div>}
  </div>;
}
