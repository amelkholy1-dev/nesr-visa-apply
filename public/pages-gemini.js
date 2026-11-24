'use strict';
/* «الإعدادات» ← قراءة صورة الجواز (Gemini): مفاتيح كتير + تبديل تلقائي لما الكوتة تخلص + شرح الطريقة والحدود والمدفوع */
(function () {
  const NA = window.NA;
  const t = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }); } catch (e) { return iso; } };
  /* الشرح اللي بيظهر في الكارت */
  NA.geminiHelp = {
    steps: `<ol style="margin:0;padding-inline-start:20px">
      <li>افتح <b dir="ltr">aistudio.google.com</b> وادخل بحساب جوجل (جيميل).</li>
      <li>دوس <b>Get API key</b> (في القايمة على الشمال)، وبعدين <b>Create API key</b>.</li>
      <li>لو سألك على مشروع (Project) اختار مشروع موجود أو اعمل جديد، ودوس إنشاء.</li>
      <li>انسخ المفتاح (بيبدأ بـ <b dir="ltr">AIza</b>).</li>
      <li>ارجع هنا، الصقه في «المفتاح»، اكتب اسم يفكّرك بيه، ودوس <b>إضافة وتجربة</b>. لو طلع «شغّال» خلاص.</li></ol>
      <div class="muted" style="margin-top:6px">المفتاح بيتحفظ متشفّر على السيرفر، ومحدش بيشوفه تاني (بيظهر آخر 4 حروف بس). لو اتسرّب امسحه من AI Studio واعمل غيره.</div>`,
    limits: `<ul style="margin:0;padding-inline-start:20px">
      <li><b>المجاني:</b> مش محتاج كارت. ليه حد لعدد الطلبات <b>في الدقيقة</b> وحد <b>في اليوم</b>. كل صورة جواز = طلب واحد. الأرقام نفسها جوجل بتغيّرها كل فترة وبتختلف من موديل للتاني، فشوفها من AI Studio: افتح المشروع ← <b>Usage</b> / <b>Rate limits</b>.</li>
      <li><b>الحد اليومي</b> بيتجدد نص الليل بتوقيت أمريكا (Pacific)، يعني حوالي 10 أو 11 الصبح بتوقيت مصر.</li>
      <li><b>مهم:</b> الحد محسوب على <b>المشروع (Project)</b> مش على المفتاح. يعني لو عملت مفتاحين من نفس المشروع هيشيلوا نفس الحد. المفتاح الاحتياطي يبقى من مشروع تاني.</li>
      <li><b>الخصوصية:</b> في المجاني جوجل بتقول إن البيانات اللي بتتبعت ممكن تستخدمها في تحسين خدماتها، وفي المدفوع لأ. خد بالك إن دي صور جوازات ناس.</li>
      <li><b>المدفوع (لو حبيت):</b> في AI Studio جنب المشروع فيه <b>Set up billing</b> (تفعيل الدفع)، بيوديك لـ Google Cloud تضيف وسيلة دفع للمشروع. بعدها نفس المفتاح بتاع المشروع ده بيبقى مدفوع: الحدود أعلى بكتير، وبتدفع على قد الاستخدام. هنا في النظام علّم عليه «مدفوع». الأسعار في صفحة <b>Pricing</b> بتاعة Gemini.</li>
      <li>تقدر في AI Studio/Google Cloud تحط حد للصرف أو تنبيه (Budget) عشان ماتتفاجئش.</li>
      <li>فتح حسابات كتير عشان تعدّي الحد المجاني ممكن جوجل تعتبره مخالف لشروطها، فالأفضل المفاتيح الإضافية تبقى لاستخدام حقيقي (مثلاً مفتاح مجاني + مفتاح مدفوع احتياطي).</li></ul>`,
    failover: `<ol style="margin:0;padding-inline-start:20px">
      <li>النظام بيستخدم أول مفتاح شغّال في الجدول (وبيقدّم المجاني على المدفوع لو علّمت «المدفوع يتستخدم بس لما المجاني يخلص»).</li>
      <li>لو جوجل ردّت إن الكوتة خلصت: لو كوتة <b>الدقيقة</b> المفتاح بيستريّح دقيقة، ولو كوتة <b>اليوم</b> بيستريّح لحد ما اليوم يتجدد. وفي نفس اللحظة بيجرّب المفتاح اللي بعده، فإنت مش بتحس بحاجة.</li>
      <li>لو المفتاح غلط أو اتلغى بيستريّح 10 دقايق وبيظهرلك «فيه مشكلة» هنا.</li>
      <li>لو كل المفاتيح خلصت: بتطلعلك رسالة، وتقدر تلصق سطري MRZ بإيدك زي الأول.</li>
      <li>«جرّبه تاني دلوقتي» بيشيل الراحة عن مفتاح (مثلاً لو فعّلت عليه الدفع).</li></ol>`
  };
  NA.geminiCard = function (box) {
    const { api, e, toast, fail } = NA;
    const draw = (d, msg) => {
      const rows = d.keys.map((k, i) => {
        const stt = !k.enabled ? '<span class="chip">موقوف</span>' : k.resting ? `<span class="chip warn" title="${e(k.lastError)}">مستريّح لحد ${e(t(k.restUntil))}</span>` : k.lastError ? `<span class="chip bad" title="${e(k.lastError)}">فيه مشكلة</span>` : '<span class="chip ok">شغّال</span>';
        return `<tr data-id="${e(k.id)}"><td><b>${i + 1}. ${e(k.label)}</b><div class="small muted" dir="ltr">${e(k.masked)}</div></td>
          <td>${k.paid ? '<span class="chip acc">مدفوع</span>' : '<span class="chip">مجاني</span>'}</td><td>${stt}${k.lastError ? `<div class="small muted" style="max-width:260px">${e(k.lastError)}</div>` : ''}</td>
          <td><b>${k.usedToday}</b> <span class="small muted">قراية</span></td>
          <td class="gk-act">${k.fromEnv ? '<span class="small muted">من الاستضافة</span> <button class="btn small" data-a="test">جرّب</button>' : `<button class="btn small" data-a="test">جرّب</button>
            <button class="ibtn" data-a="up" title="لفوق">${NA.icon('up', 15)}</button><button class="ibtn" data-a="down" title="لتحت">${NA.icon('down', 15)}</button>
            <button class="btn small" data-a="paid">${k.paid ? 'خليه مجاني' : 'خليه مدفوع'}</button><button class="btn small" data-a="toggle">${k.enabled ? 'إيقاف' : 'تشغيل'}</button>
            ${k.resting ? '<button class="btn small" data-a="unrest">جرّبه تاني دلوقتي</button>' : ''}<button class="ibtn danger" data-a="del" title="مسح">${NA.icon('trash', 15)}</button>`}</td></tr>`;
      }).join('');
      box.innerHTML = `<div class="card"><h2>قراءة صورة الجواز تلقائي (Gemini)</h2>
        <div class="muted small" style="margin-bottom:10px">لما ترفع صورة جواز، النظام بيبعتها لـ Gemini (ذكاء اصطناعي من Google) يقرا منها سطري MRZ والاسم العربي ومكان الميلاد والتواريخ، وبعدها النظام بيراجع الـ MRZ بأرقام التحقق بتاعته. من غيرها بتلصق سطري MRZ بإيدك.</div>
        ${msg ? `<div class="card ${msg.ok ? '' : 'issues'}" style="margin-bottom:10px;padding:10px 14px">${msg.ok ? '✅ ' : '⚠️ '}${e(msg.message)}</div>` : ''}
        ${d.keys.length ? `<div class="tbl-wrap"><table><thead><tr><th>المفتاح</th><th>النوع</th><th>الحالة</th><th>النهارده</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="small muted" style="margin-top:6px">النظام بيجرّب المفاتيح بالترتيب ده. لو مفتاح خلصت الكوتة بتاعته بيستريّح وبيكمّل باللي بعده لوحده. «النهارده» = عدد القرايات من نص الليل بتوقيت أمريكا (وقت تجديد الكوتة اليومية)، ودي حوالي 10 أو 11 الصبح بتوقيت مصر.</div>`
          : '<div class="card issues" style="padding:10px 14px">مفيش مفتاح لسه: القراءة التلقائية مقفولة. ضيف مفتاح تحت.</div>'}
        <h3 style="margin:16px 0 8px">إضافة مفتاح</h3>
        <div class="row" style="align-items:end;flex-wrap:wrap;gap:10px"><label class="f" style="width:200px">اسم يفكّرك بيه<input id="gkLabel" placeholder="مثلاً: جيميل المكتب"></label>
          <label class="f" style="flex:1;min-width:260px">المفتاح (API key)<input id="gkKey" type="password" dir="ltr" autocomplete="off" placeholder="AIza..."></label>
          <label style="display:flex;gap:6px;align-items:center;padding-bottom:10px;font-weight:700"><input type="checkbox" id="gkPaid"> مدفوع</label>
          <button class="btn green" id="gkAdd" type="button">إضافة وتجربة</button></div>
        <div class="row" style="margin-top:14px;align-items:end;flex-wrap:wrap;gap:10px"><label class="f" style="width:260px">الموديل<input id="gkModel" dir="ltr" list="gkModels" value="${e(d.model)}"><datalist id="gkModels"><option value="gemini-2.5-flash"><option value="gemini-2.5-flash-lite"><option value="gemini-2.5-pro"></datalist></label>
          <label style="display:flex;gap:6px;align-items:center;padding-bottom:10px;font-weight:700"><input type="checkbox" id="gkPaidLast"${d.paidLast ? ' checked' : ''}> المدفوع يتستخدم بس لما المجاني يخلص</label>
          <button class="btn" id="gkSave" type="button">حفظ</button></div>
        <details style="margin-top:16px"><summary style="cursor:pointer;font-weight:800">إزاي تجيب مفتاح؟ (خطوة خطوة)</summary><div class="small" style="line-height:2;margin-top:6px">${NA.geminiHelp.steps}</div></details>
        <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:800">الحدود (الليمت) والمجاني والمدفوع</summary><div class="small" style="line-height:2;margin-top:6px">${NA.geminiHelp.limits}</div></details>
        <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:800">إزاي التبديل التلقائي بيشتغل؟</summary><div class="small" style="line-height:2;margin-top:6px">${NA.geminiHelp.failover}</div></details>
      </div>`;
      const act = async (fn, okMsg) => { try { const r = await fn(); draw(r, r.test || (okMsg ? { ok: true, message: okMsg } : null)); } catch (er) { fail(er); } };
      box.querySelector('#gkAdd').onclick = () => {
        const key = box.querySelector('#gkKey').value.trim(); if (!key) return toast('الصق المفتاح الأول', 'err');
        act(() => api('POST', '/settings/gemini/keys', { label: box.querySelector('#gkLabel').value, key, paid: box.querySelector('#gkPaid').checked }));
      };
      box.querySelector('#gkSave').onclick = () => act(() => api('PUT', '/settings/gemini', { model: box.querySelector('#gkModel').value, paidLast: box.querySelector('#gkPaidLast').checked }), 'اتحفظ');
      box.querySelectorAll('tr[data-id] [data-a]').forEach((b) => {
        b.onclick = () => {
          const id = b.closest('tr').dataset.id; const k = d.keys.find((x) => x.id === id) || {}; const a = b.dataset.a; const u = `/settings/gemini/keys/${encodeURIComponent(id)}`;
          if (a === 'test') return act(() => api('POST', u + '/test'));
          if (a === 'del') { if (!confirm(`تمسح المفتاح «${k.label}»؟`)) return; return act(() => api('DELETE', u), 'اتمسح'); }
          if (a === 'up' || a === 'down') return act(() => api('PUT', u, { move: a }));
          if (a === 'paid') return act(() => api('PUT', u, { paid: !k.paid }));
          if (a === 'toggle') return act(() => api('PUT', u, { enabled: !k.enabled }));
          if (a === 'unrest') return act(() => api('PUT', u, { resetRest: true }));
        };
      });
    };
    box.innerHTML = '<div class="card muted">بيحمّل إعدادات Gemini…</div>';
    api('GET', '/settings/gemini').then((d) => draw(d)).catch((er) => { box.innerHTML = `<div class="card issues">${e(er.message)}</div>`; });
  };
})();
