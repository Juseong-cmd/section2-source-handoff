'use client';
import {useState} from 'react';
import type {WardrobeItem} from './wardrobe';
export function AccessorySprite({item}:{item:WardrobeItem}) {
 const [failed,setFailed]=useState(false);
 return item.asset&&!failed?<img src={item.asset} alt="" aria-hidden="true" draggable={false} onError={()=>setFailed(true)} style={{filter:item.filter}}/>:null;
}
