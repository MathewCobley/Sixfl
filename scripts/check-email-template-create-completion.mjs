import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path,'utf8');
for (const channel of ['email','sms']) {
  const form=read(`src/components/admin/${channel}-templates/${channel==='email'?'Email':'Sms'}TemplateForm.tsx`);
  assert.ok(form.includes('useTemplateSave') && form.includes('onSubmit={save.onSubmit}') && form.includes('<TemplateSaveControls'));
  assert.ok(!form.includes('useActionState') && !form.includes('useFormStatus'),'save feedback cannot wait on an RSC action transition');
}
const ui=read('src/components/admin/templates/useTemplateSave.tsx');
assert.ok(ui.includes('inFlight.current') && ui.includes('finally') && ui.includes('setPending(false)'));
assert.ok(ui.includes('window.location.replace(savedUrl)') && ui.includes('Open saved template'));
assert.ok(ui.includes('Check save status') && ui.includes('submitted.current'));
const request=read('src/lib/templates/save-request.ts');
assert.ok(request.includes('Promise.race') && request.includes('20_000') && request.includes('controller.abort()'));
const route=read('src/app/api/admin/templates/save/route.ts');
assert.ok(route.includes('await requireAdmin()') && route.includes('sameOrigin') && route.includes('x-sixfl-template-request'));
assert.ok(route.includes('operation === "check"') && route.includes('matchesSavedTemplate'));
for(const action of ['createEmailTemplateAction','updateEmailTemplateAction','createSystemEmailTemplateAction','updateSystemEmailTemplateAction','createSmsTemplateAction','updateSmsTemplateAction','createSystemSmsTemplateAction','updateSystemSmsTemplateAction'])assert.ok(route.includes(action));
for(const page of ['src/app/(admin)/admin/templates/new/page.tsx','src/app/(admin)/admin/templates/[id]/page.tsx'])assert.ok(!read(page).includes('action={'),'all editors must use JSON saves');
assert.ok(!read('src/app/(admin)/admin/sms-templates/actions.ts').includes('redirect(`/admin/templates/${created.id}`)'));
console.log('Template create/save completion contract passed for campaign/system email and SMS.');
