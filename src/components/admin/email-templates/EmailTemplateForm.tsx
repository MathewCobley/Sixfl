// ========================================
// File: src/components/admin/email-templates/EmailTemplateForm.tsx
// ========================================

"use client";

import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTemplateSave, TemplateSaveControls } from "@/components/admin/templates/useTemplateSave";
import { buildSIXFLEmailHtml } from "@/lib/email/buildEmail";
import { REFERRAL_PAGE_URL } from "@/lib/email/template-cta";
import { toggleItalicSelection } from "@/lib/email/editor-formatting";
import {
  TEAM_MOVE_RESPONSE_BLOCK,
  renderTeamMoveResponseBlock,
} from "@/lib/teams/move-response-markers";

type TemplateAudience = "LEAD" | "TEAM" | "PLAYER" | "REFEREE" | "GENERAL";
type InterestTypeValue = "" | "TEAM" | "PLAYER" | "REFEREE";
type CtaUrlKeyValue = "" | "signupUrl" | "manageTeamUrl" | "paymentUrl" | "captainDashboardUrl" | "teamJoinUrl" | "squadActivationUrl" | "fixtureUrl" | "fixturesUrl" | "referralPageUrl";
type EmailTemplateFormValues = { id?:string; key:string; name:string; description:string; audience:TemplateAudience; interestType:InterestTypeValue; subject:string; body:string; ctaLabel:string; ctaUrlKey:CtaUrlKeyValue; isActive:boolean };
type EmailTemplateFormProps = { mode:"create"|"edit"; templateType:"campaign"|"system"; initialValues?:Partial<EmailTemplateFormValues> };

const AUDIENCE_OPTIONS:Array<{value:TemplateAudience;label:string;description:string}>=[
  {value:"LEAD",label:"Lead",description:"General lead nurture and enquiry follow-up."},
  {value:"TEAM",label:"Team",description:"Team-specific admin or captain communication."},
  {value:"PLAYER",label:"Player",description:"Player sign-up and player messaging."},
  {value:"REFEREE",label:"Referee",description:"Referee onboarding and operational emails."},
  {value:"GENERAL",label:"General",description:"Reusable template not tied to one audience."},
];
const INTEREST_TYPE_OPTIONS:Array<{value:InterestTypeValue;label:string;description:string}>=[
  {value:"",label:"None",description:"Do not restrict this to a specific lead interest type."},
  {value:"TEAM",label:"Team",description:"Best for team enquiry follow-up."},
  {value:"PLAYER",label:"Player",description:"Best for individual player follow-up."},
  {value:"REFEREE",label:"Referee",description:"Best for referee enquiry follow-up."},
];
const TOKENS=[
  "{{firstName}}","{{fullName}}","{{teamName}}","{{sixflTvPriorityScore}}","{{teamContextLine}}","{{squadActivationUrl}}","{{opponentName}}","{{leagueName}}","{{leagueDisplayName}}","{{fixtureName}}","{{kickoffLabel}}","{{kickoffDateTime}}","{{fixturesList}}","{{amount}}","{{claimCode}}","{{claimLink}}","{{captainDashboardUrl}}","{{captainFixturesUrl}}","{{signInUrl}}","{{claimUrl}}","{{pendingCaptainNotice}}","{{fixtureUrl}}","{{fixturesUrl}}","{{paymentUrl}}","{{area}}","{{preferredNight}}","{{link}}","{{yesResponseUrl}}","{{noResponseUrl}}","{{cupName}}","{{cupFormat}}","{{matchFee}}","{{venueNote}}","{{scheduleNote}}","{{responseDeadline}}","{{cta}}",
] as const;
const CUP_RESPONSE_BLOCK=[
  "SIXFL_POLL_OPTIONS_START",
  "Yes — our team is interested: {{yesResponseUrl}}",
  "No — not this time: {{noResponseUrl}}",
  "SIXFL_POLL_OPTIONS_END",
].join("\n");
const CTA_OPTIONS:Array<{value:CtaUrlKeyValue;label:string;previewUrl?:string}>=[
  {value:"",label:"No button"},
  {value:"referralPageUrl",label:"Referral page",previewUrl:REFERRAL_PAGE_URL},
  {value:"signupUrl",label:"Register interest",previewUrl:"https://www.sixfl.co.uk/register-interest"},
  {value:"manageTeamUrl",label:"Manage team",previewUrl:"https://www.sixfl.co.uk/claim?code=H862NY"},
  {value:"captainDashboardUrl",label:"Captain dashboard",previewUrl:"https://www.sixfl.co.uk/claim?code=H862NY"},
  {value:"teamJoinUrl",label:"Team join page",previewUrl:"https://www.sixfl.co.uk/teams/join/rossett-nomads"},
  {value:"squadActivationUrl",label:"Squad activation page",previewUrl:"https://www.sixfl.co.uk/squad/activate/demo-token"},
  {value:"fixtureUrl",label:"Fixture page",previewUrl:"https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures/harrogate-athletic-vs-rossett-vets"},
  {value:"fixturesUrl",label:"Fixtures page",previewUrl:"https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures"},
  {value:"paymentUrl",label:"Payment link",previewUrl:"https://www.sixfl.co.uk/pay/charge/demo-token"},
];

function slugifyTemplateKey(value:string){return value.trim().toLowerCase().replace(/['"]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}
function getLineRange(text:string,start:number,end:number){const lineStart=text.lastIndexOf("\n",Math.max(0,start-1))+1;const nextLineBreak=text.indexOf("\n",end);return {lineStart,lineEnd:nextLineBreak===-1?text.length:nextLineBreak};}
function previewReplace(text:string){
  const withMoveResponse=renderTeamMoveResponseBlock(text,{
    yesUrl:"https://www.sixfl.co.uk/team-move/preview?answer=YES",
    noUrl:"https://www.sixfl.co.uk/team-move/preview?answer=NO",
  });
  return withMoveResponse
  .replaceAll("{{firstName}}","Jordan").replaceAll("{{fullName}}","Jordan Smith").replaceAll("{{teamName}}","Rossett Nomads").replaceAll("{{sixflTvPriorityScore}}","86")
  .replaceAll("{{teamContextLine}}","You’ve been added to the Rossett Nomads squad that plays on a Tuesday night at Rossett Sports Centre.")
  .replaceAll("{{squadActivationUrl}}","https://www.sixfl.co.uk/squad/activate/demo-token").replaceAll("{{opponentName}}","Rossett Vets")
  .replaceAll("{{leagueName}}","Rossett Mens Tuesday").replaceAll("{{leagueDisplayName}}","Rossett Mens Tuesday — Spring 2026")
  .replaceAll("{{fixtureName}}","Harrogate Athletic vs Rossett Vets").replaceAll("{{kickoffLabel}}","Tue 21 Apr, 21:20").replaceAll("{{kickoffDateTime}}","Tue 21 Apr, 21:20")
  .replaceAll("{{fixturesList}}","Tue 21 Apr, 21:20 — Harrogate Athletic vs Rossett Vets\nTue 28 Apr, 20:40 — Rossett Vets vs Boroughbridge United")
  .replaceAll("{{amount}}","£30.00").replaceAll("{{claimCode}}","H862NY").replaceAll("{{claimLink}}","https://www.sixfl.co.uk/claim?code=H862NY")
  .replaceAll("{{captainDashboardUrl}}","https://www.sixfl.co.uk/claim?code=H862NY").replaceAll("{{captainFixturesUrl}}","https://www.sixfl.co.uk/captain/team/demo-team/fixtures")
  .replaceAll("{{signInUrl}}","https://www.sixfl.co.uk/api/auth/callback/email?token=demo-token").replaceAll("{{claimUrl}}","https://www.sixfl.co.uk/claim?code=H862NY")
  .replaceAll("{{pendingCaptainNotice}}","It looks like your captain access still needs to be claimed for Harrogate Athletic. Sign in first, then complete your team claim.")
  .replaceAll("{{fixtureUrl}}","https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures/harrogate-athletic-vs-rossett-vets").replaceAll("{{fixturesUrl}}","https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures")
  .replaceAll("{{paymentUrl}}","https://www.sixfl.co.uk/pay/charge/demo-token").replaceAll("{{yesResponseUrl}}","https://www.sixfl.co.uk/cup-invitation/preview?answer=YES").replaceAll("{{noResponseUrl}}","https://www.sixfl.co.uk/cup-invitation/preview?answer=NO")
  .replaceAll("{{cupName}}","SIXFL Inter League County Cup").replaceAll("{{cupFormat}}","straight knockout").replaceAll("{{matchFee}}","£40.00").replaceAll("{{venueNote}}","Cup venues confirmed by SIXFL").replaceAll("{{scheduleNote}}","Cup ties arranged on the published cup nights").replaceAll("{{responseDeadline}}","30 September 2026, 18:00")
  .replaceAll("{{area}}","Harrogate").replaceAll("{{preferredNight}}","Tuesday").replaceAll("{{link}}","https://www.sixfl.co.uk/captain/team/demo-team/fixtures");}

export default function EmailTemplateForm({mode,templateType,initialValues}:EmailTemplateFormProps){
  const save=useTemplateSave({mode,templateType,channel:"EMAIL"}),{state}=save;
  const [key,setKey]=useState(initialValues?.key??""),[name,setName]=useState(initialValues?.name??""),[description,setDescription]=useState(initialValues?.description??"");
  const [audience,setAudience]=useState<TemplateAudience>(initialValues?.audience??"LEAD"),[interestType,setInterestType]=useState<InterestTypeValue>(initialValues?.interestType??"");
  const [subject,setSubject]=useState(initialValues?.subject??""),[body,setBody]=useState(initialValues?.body??""),[ctaLabel,setCtaLabel]=useState(initialValues?.ctaLabel??"");
  const [ctaUrlKey,setCtaUrlKey]=useState<CtaUrlKeyValue>(initialValues?.ctaUrlKey??""),[isActive,setIsActive]=useState(initialValues?.isActive??true);
  const bodyRef=useRef<HTMLTextAreaElement|null>(null);
  useEffect(()=>{if(mode==="create"&&!key.trim()&&name.trim())setKey(slugifyTemplateKey(name));},[key,mode,name]);
  useEffect(()=>{if(audience!=="LEAD"&&interestType!=="")setInterestType("");},[audience,interestType]);
  const selectedCta=useMemo(()=>CTA_OPTIONS.find(option=>option.value===ctaUrlKey)??CTA_OPTIONS[0],[ctaUrlKey]);
  const previewSubject=useMemo(()=>previewReplace(subject),[subject]);
  const previewHtml=useMemo(()=>buildSIXFLEmailHtml({body:previewReplace(body),cta:ctaLabel&&selectedCta.previewUrl?{label:ctaLabel,url:selectedCta.previewUrl}:undefined}),[body,ctaLabel,selectedCta.previewUrl]);

  function setBodyAndSelection(next:string,selectionStart:number,selectionEnd=selectionStart){const textarea=bodyRef.current;setBody(next);requestAnimationFrame(()=>{textarea?.focus();textarea?.setSelectionRange(selectionStart,selectionEnd);});}
  function insertToken(token:string){const textarea=bodyRef.current;if(!textarea){setBody(current=>`${current}${current?"\n":""}${token}`);return;}const start=textarea.selectionStart??body.length,end=textarea.selectionEnd??body.length,next=`${body.slice(0,start)}${token}${body.slice(end)}`;setBodyAndSelection(next,start+token.length);}
  function insertResponseBlock(block:string){const textarea=bodyRef.current;if(!textarea){setBody(current=>`${current}${current?"\n\n":""}${block}`);return;}const start=textarea.selectionStart??body.length,end=textarea.selectionEnd??body.length,before=body.slice(0,start),after=body.slice(end),prefix=before&&!before.endsWith("\n")?"\n\n":"",suffix=after&&!after.startsWith("\n")?"\n\n":"",insertion=`${prefix}${block}${suffix}`,next=`${before}${insertion}${after}`;setBodyAndSelection(next,start+insertion.length-suffix.length);}
  function insertCupResponseButtons(){insertResponseBlock(CUP_RESPONSE_BLOCK);}
  function insertTeamMoveResponseButtons(){insertResponseBlock(TEAM_MOVE_RESPONSE_BLOCK);}
  function insertBoldText(){const textarea=bodyRef.current,fallbackText="bold text";if(!textarea){setBody(current=>`${current}${current?"\n":""}**${fallbackText}**`);return;}const start=textarea.selectionStart??body.length,end=textarea.selectionEnd??body.length,selectedText=body.slice(start,end),boldText=selectedText||fallbackText,next=`${body.slice(0,start)}**${boldText}**${body.slice(end)}`;if(selectedText){setBodyAndSelection(next,start+boldText.length+4);return;}setBodyAndSelection(next,start+2,start+2+fallbackText.length);}
  function insertItalicText(){const textarea=bodyRef.current,result=toggleItalicSelection(body,textarea?.selectionStart??body.length,textarea?.selectionEnd??body.length);setBodyAndSelection(result.text,result.start,result.end);}
  function insertBulletText(){const textarea=bodyRef.current,fallbackText="Bullet point";if(!textarea){setBody(current=>`${current}${current?"\n":""}- ${fallbackText}`);return;}const start=textarea.selectionStart??body.length,end=textarea.selectionEnd??body.length,selectedText=body.slice(start,end);if(selectedText){const bulletText=selectedText.split("\n").map(line=>!line.trim()||/^\s*-\s+/.test(line)?line:`${line.match(/^\s*/)?.[0]??""}- ${line.trimStart()}`).join("\n"),next=`${body.slice(0,start)}${bulletText}${body.slice(end)}`;setBodyAndSelection(next,start,start+bulletText.length);return;}const needsLineBreak=start>0&&body[start-1]!=="\n",prefix=needsLineBreak?"\n":"",insertion=`${prefix}- ${fallbackText}`,next=`${body.slice(0,start)}${insertion}${body.slice(end)}`,selectionStart=start+prefix.length+2;setBodyAndSelection(next,selectionStart,selectionStart+fallbackText.length);}
  function indentSelectedLines(input:{start:number;end:number;outdent:boolean}){const indent="  ",{lineStart,lineEnd}=getLineRange(body,input.start,input.end),block=body.slice(lineStart,lineEnd),lines=block.split("\n");if(input.outdent){let offset=0,removedBeforeStart=0,removedBeforeEnd=0;const nextLines=lines.map(line=>{const absoluteLineStart=lineStart+offset,removeCount=line.startsWith(indent)?indent.length:line.startsWith(" ")||line.startsWith("\t")?1:0;offset+=line.length+1;if(!removeCount)return line;if(absoluteLineStart<input.start)removedBeforeStart+=removeCount;if(absoluteLineStart<input.end)removedBeforeEnd+=removeCount;return line.slice(removeCount);}),nextBlock=nextLines.join("\n"),next=`${body.slice(0,lineStart)}${nextBlock}${body.slice(lineEnd)}`;setBodyAndSelection(next,Math.max(lineStart,input.start-removedBeforeStart),Math.max(lineStart,input.end-removedBeforeEnd));return;}const nextBlock=lines.map(line=>`${indent}${line}`).join("\n"),next=`${body.slice(0,lineStart)}${nextBlock}${body.slice(lineEnd)}`,addedCharacters=nextBlock.length-block.length;setBodyAndSelection(next,input.start+indent.length,input.end+addedCharacters);}
  function handleBodyKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==="i"){event.preventDefault();insertItalicText();return;}if(event.key!=="Tab")return;event.preventDefault();const textarea=event.currentTarget,start=textarea.selectionStart??body.length,end=textarea.selectionEnd??body.length;indentSelectedLines({start,end,outdent:event.shiftKey});}

  const disabled=save.pending||Boolean(save.savedUrl)||Boolean(state.needsCheck);
  return <form onSubmit={save.onSubmit} className="space-y-8">
    {initialValues?.id?<input type="hidden" name="id" value={initialValues.id}/>:null}<input type="hidden" name="audience" value={audience}/><input type="hidden" name="interestType" value={interestType}/><input type="hidden" name="ctaUrlKey" value={ctaUrlKey}/><input type="hidden" name="isActive" value={String(isActive)}/>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]"><div className="space-y-8"><fieldset disabled={disabled} className="min-w-0 space-y-8">
      <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-white">Template details</h2><p className="mt-1 text-sm text-neutral-400">Keep this clean and reusable. Keys should stay stable once used.</p></div><div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2"><label className="text-sm font-medium text-white">Template name</label><input name="name" value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"/>{state?.errors?.name?.[0]?<p className="text-sm text-red-400">{state.errors.name[0]}</p>:null}</div>
        <div className="space-y-2"><label className="text-sm font-medium text-white">Template key</label><input name="key" value={key} onChange={e=>setKey(slugifyTemplateKey(e.target.value))} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"/>{state?.errors?.key?.[0]?<p className="text-sm text-red-400">{state.errors.key[0]}</p>:null}</div>
        <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium text-white">Description</label><textarea name="description" rows={4} value={description} onChange={e=>setDescription(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"/></div>
      </div></section>
      <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-white">Audience</h2><p className="mt-1 text-sm text-neutral-400">Choose who this template is for.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{AUDIENCE_OPTIONS.map(option=><button key={option.value} type="button" onClick={()=>setAudience(option.value)} className={["rounded-2xl border px-4 py-4 text-left transition",audience===option.value?"border-emerald-400/50 bg-emerald-500/10 text-white":"border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05]"].join(" ")}><div className="text-sm font-semibold">{option.label}</div><div className="mt-2 text-xs leading-5 text-neutral-400">{option.description}</div></button>)}</div></section>
      {audience==="LEAD"?<section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-white">Interest type</h2><p className="mt-1 text-sm text-neutral-400">Optionally narrow this lead template to a specific enquiry type.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{INTEREST_TYPE_OPTIONS.map(option=><button key={option.label} type="button" onClick={()=>setInterestType(option.value)} className={["rounded-2xl border px-4 py-4 text-left transition",interestType===option.value?"border-emerald-400/50 bg-emerald-500/10 text-white":"border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05]"].join(" ")}><div className="text-sm font-semibold">{option.label}</div><div className="mt-2 text-xs leading-5 text-neutral-400">{option.description}</div></button>)}</div></section>:null}
      <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-white">Email content</h2></div><div className="space-y-5">
        <div className="space-y-2"><label className="text-sm font-medium text-white">Subject</label><input name="subject" value={subject} onChange={e=>setSubject(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"/>{state?.errors?.subject?.[0]?<p className="text-sm text-red-400">{state.errors.subject[0]}</p>:null}</div>
        {audience==="TEAM"?<><div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.07] p-4"><div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Cup response</div><p className="mt-2 text-xs leading-5 text-cyan-100/80">For a cup invitation, click once to add the linked YES / NO buttons. SIXFL replaces them with private links for each team and records the answer against that team.</p><button type="button" onClick={insertCupResponseButtons} className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15">Insert Cup YES / NO response</button></div><div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4"><div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">League move response</div><p className="mt-2 text-xs leading-5 text-amber-100/80">For a league marked as moving, add YES / NO buttons that give each team a private confirmation link. Their answer updates the existing Team move confirmation status. Use this template from League → Communications.</p><button type="button" onClick={insertTeamMoveResponseButtons} className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15">Insert League Move YES / NO response</button></div></>:null}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4"><div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Quick insert</div><div className="mt-3 flex flex-wrap gap-2">{TOKENS.map(token=><button key={token} type="button" onClick={()=>insertToken(token)} className="rounded-full border border-emerald-500/25 bg-black/30 px-3 py-1.5 text-sm text-emerald-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10">{token}</button>)}</div></div>
        <div className="space-y-2"><div data-email-template-bold-toolbar="true" className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm font-medium text-white">Message body</label><div className="flex flex-wrap gap-2"><button type="button" onClick={insertBoldText} className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-emerald-100">Bold</button><button type="button" onClick={insertItalicText} aria-label="Italics" title="Italicise selected text (Ctrl+I or Command+I)" className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm italic text-white transition hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-emerald-100">Italics</button><button type="button" onClick={insertBulletText} className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-emerald-100">Bullet</button></div></div><p className="text-xs leading-5 text-neutral-400">Highlight text and click Bold, Italics or Bullet. Italics also supports Ctrl+I / Command+I. Use Tab / Shift+Tab in the message box to indent or outdent bullet lines.</p><textarea ref={bodyRef} name="body" rows={16} value={body} onChange={e=>setBody(e.target.value)} onKeyDown={handleBodyKeyDown} className="min-h-[420px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white outline-none focus:border-emerald-400/50"/>{state?.errors?.body?.[0]?<p className="text-sm text-red-400">{state.errors.body[0]}</p>:null}</div>
      </div></section>
      <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-white">Call to action</h2></div><div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><div className="space-y-5"><div className="space-y-2"><label className="text-sm font-medium text-white">CTA button text</label><input name="ctaLabel" value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"/>{state?.errors?.ctaLabel?.[0]?<p className="text-sm text-red-400">{state.errors.ctaLabel[0]}</p>:null}</div><button type="button" onClick={()=>insertToken("{{cta}}") } className="inline-flex rounded-xl border border-emerald-500/20 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10">Insert {"{{cta}}"} at cursor</button></div><div><div className="mb-2 text-sm font-medium text-white">CTA destination</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{CTA_OPTIONS.map(option=><button key={option.value||"none"} type="button" onClick={()=>setCtaUrlKey(option.value)} className={["rounded-2xl border px-4 py-4 text-left transition",ctaUrlKey===option.value?"border-emerald-400/50 bg-emerald-500/10":"border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"].join(" ")}><div className="text-sm font-semibold text-white">{option.label}</div>{option.previewUrl?<div className="mt-2 truncate text-xs text-emerald-300/90">{option.previewUrl}</div>:null}</button>)}</div>{ctaUrlKey==="referralPageUrl"?<p className="mt-3 text-xs leading-5 text-neutral-400">Opens the referral page, where each person signs in to get their own referral code and sharing link.</p>:null}{state?.errors?.ctaUrlKey?.[0]?<p className="mt-3 text-sm text-red-400">{state.errors.ctaUrlKey[0]}</p>:null}</div></div></section>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"><input type="checkbox" checked={isActive} onChange={e=>setIsActive(e.target.checked)} className="h-5 w-5 rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500"/><span className="text-sm font-medium text-white">Template is active</span></label>
    </fieldset><TemplateSaveControls save={save} mode={mode}/></div>
    <aside className="rounded-3xl border border-emerald-500/20 bg-[#04120d] p-6"><div className="mb-5"><div className="text-sm font-medium text-white/70">Live preview</div></div><div className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_12px_50px_rgba(0,0,0,0.18)]"><div className="border-b border-black/5 px-6 py-4 text-xl font-semibold leading-tight text-[#111827]">{previewSubject||"Your email subject preview"}</div><EmailHtmlPreview html={previewHtml}/></div></aside>
    </div>
  </form>;
}
