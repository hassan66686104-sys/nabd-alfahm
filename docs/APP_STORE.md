# نشر «نبض الفهم» على App Store

التطبيق جاهز في المستودع كتطبيق iOS حقيقي (Capacitor). الواجهة كلها مضمّنة داخل التطبيق، ويتصل بقاعدة البيانات نفسها التي يستخدمها الموقع، فحساب المعلم وأسئلته وتقاريره واحدة في الموقع والتطبيق.

## ما تم تجهيزه

| العنصر | المكان |
|---|---|
| مشروع Xcode (iPhone و iPad) | `ios/App/App.xcodeproj` |
| معرّف التطبيق (Bundle ID) | `app.nabdalfahm.teacher` |
| اسم التطبيق على الشاشة | نبض الفهم |
| الأيقونة 1024×1024 بلا شفافية، وشاشة البداية | `ios/App/App/Assets.xcassets` (تُولَّد بـ `node scripts/generate-ios-assets.mjs`) |
| اللغة الأساسية العربية، وإعلان عدم استخدام تشفير خاص | `ios/App/App/Info.plist` |
| حذف الحساب من داخل التطبيق (شرط Apple 5.1.1) | الإعدادات ← الخصوصية والحساب |
| صفحة سياسة الخصوصية | https://nabd-alfahm.netlify.app/privacy |
| بناء سحابي بدون Mac | `codemagic.yaml` |
| أمر البناء | `npm run build:ios` |

## ما يحتاج إلى يدك (لا يمكن عمله نيابة عنك)

### 1. حساب Apple Developer
- اشترك في https://developer.apple.com/programs/ (99 دولارًا في السنة).
- يمكن التسجيل كفرد باسمك، أو كمؤسسة (يتطلب رقم D-U-N-S للمدرسة أو الجهة).
- الموافقة تستغرق عادة من يوم إلى يومين.

### 2. إنشاء التطبيق في App Store Connect
- ادخل https://appstoreconnect.apple.com ← Apps ← ➕ New App.
- Platform: iOS، Name: **نبض الفهم**، Primary Language: Arabic.
- Bundle ID: سجّله أولًا في developer.apple.com ← Identifiers بالقيمة `app.nabdalfahm.teacher` ثم اختره.
- SKU: أي نص، مثل `nabd-alfahm-1`.
- انسخ رقم **Apple ID** الذي يظهر في صفحة App Information (رقم من 10 خانات).

### 3. البناء والرفع: اختر طريقة واحدة

**أ) بدون Mac عبر Codemagic (موصى به لك)**
1. أنشئ حسابًا مجانيًا في https://codemagic.io وسجّل الدخول بحساب GitHub، ثم أضف المستودع `nabd-alfahm`.
2. في App Store Connect ← Users and Access ← Integrations ← App Store Connect API أنشئ مفتاحًا بصلاحية **App Manager** ونزّل ملف `.p8`.
3. في Codemagic ← Teams ← Integrations ← App Store Connect أضف المفتاح باسم **`nabd_asc`** (Issuer ID و Key ID والملف).
4. في `codemagic.yaml` ضع رقم Apple ID من الخطوة 2 مكان `0000000000` (أو أرسله لي وأعدّله أنا).
5. شغّل الـ workflow «نبض الفهم iOS». سيوقّع التطبيق تلقائيًا ويرفعه إلى TestFlight.

**ب) إذا توفر لديك Mac**
```bash
npm ci
npm run build:ios
npx cap open ios
```
في Xcode: اختر فريقك في Signing & Capabilities، ثم Product ← Archive ← Distribute App ← App Store Connect.

### 4. التجربة على جهازك
بعد الرفع يظهر البناء في TestFlight خلال دقائق. ثبّت تطبيق TestFlight على iPhone وجرّب: تسجيل الدخول، إنشاء حصة، انضمام طالب، تحدي الكأس، وحذف حساب تجريبي.

### 5. صفحة المتجر والمراجعة
- لقطات الشاشة: مطلوبة لـ iPhone 6.9 بوصة و iPad 13 بوصة (يمكن أخذها من TestFlight أو المحاكي).
- App Privacy: أجب كما في الجدول أدناه.
- **حساب تجريبي للمراجع**: أنشئ حساب معلم فيه بضعة أسئلة، واكتب بريده وكلمة مروره في App Review Information. بدونه يُرفض التطبيق غالبًا.
- اضغط Submit for Review. المراجعة عادة من يوم إلى ثلاثة أيام.

## نصوص صفحة المتجر (جاهزة للنسخ)

**الاسم:** نبض الفهم

**العنوان الفرعي (30 حرفًا):** بنك أسئلة تفاعلي للمعلم

**الكلمات المفتاحية:** معلم,اختبار,أسئلة,حصة,طلاب,تقويم,تحدي,مسابقة,تعليم,فصل,تربية إسلامية

**الوصف:**
> نبض الفهم بنك أسئلة تفاعلي يساعد المعلم على معرفة مدى فهم طلابه أثناء الحصة، في ثوانٍ.
>
> • اطرح سؤالًا، يجيب الطلاب من أجهزتهم برمز الحصة دون حساب، وترى النتيجة فورًا.
> • مؤشرات فهم بالألوان: أخضر للإتقان، وأصفر للتعزيز، وأحمر لما يحتاج إلى معالجة.
> • أنواع أسئلة كثيرة: اختيار من متعدد، صح وخطأ، ترتيب، توصيل، إكمال فراغات، إجابة قصيرة، وأسئلة مفتوحة يصححها المعلم.
> • أسئلة فورية بنعم أو لا لقياس رأي الصف في لحظة.
> • تحدي الكأس: يختار الطالب الدرس ويلعب وحده أو مع زملائه، يجمع النقاط ويرمي رقم الحظ ويحمي نفسه بالدرع.
> • شاشة عرض كبيرة لجهاز العرض في الصف، مع رمز QR للانضمام.
> • تقارير لكل حصة تبيّن الأسئلة الأصعب والطلاب الذين يحتاجون إلى دعم.
> • خصوصية الطلاب: النتائج الفردية للمعلم فقط، وأسماء مستعارة اختيارية.
>
> إعداد الأستاذ الحسن علي.

**الفئة:** Education (التعليم)

**رابط سياسة الخصوصية:** https://nabd-alfahm.netlify.app/privacy

**رابط الدعم:** https://nabd-alfahm.netlify.app

**التصنيف العمري:** 4+

## إجابات «App Privacy» في App Store Connect

| نوع البيانات | يُجمع؟ | مرتبط بالمستخدم؟ | للتتبع؟ | الغرض |
|---|---|---|---|---|
| Email Address (المعلم) | نعم | نعم | لا | App Functionality |
| Name (المعلم، والاسم الذي يكتبه الطالب) | نعم | نعم | لا | App Functionality |
| Photos (صور الأسئلة التي يرفعها المعلم) | نعم | نعم | لا | App Functionality |
| Other User Content (الأسئلة والإجابات) | نعم | نعم | لا | App Functionality |
| أي بيانات أخرى (موقع، جهات اتصال، إعلانات، تحليلات) | لا | | | |

## ملاحظات للمراجعة (App Review Notes) جاهزة للنسخ

> This is a classroom formative-assessment tool for teachers (Arabic UI). Teachers sign in to build a question bank and run live sessions; students join with a 6-character session code and do not need an account. To test the student side, start a session from the teacher account and open the app on a second device (or https://nabd-alfahm.netlify.app/join) with the code shown. Account deletion: Settings → الخصوصية والحساب → حذف الحساب.

## تحديث التطبيق لاحقًا
أي تعديل على الموقع يظهر في الموقع فورًا، أما التطبيق فيحتاج بناءً جديدًا: شغّل workflow Codemagic مرة أخرى (يرفع رقم البناء تلقائيًا)، وعند تغيير الإصدار عدّل `MARKETING_VERSION` في مشروع Xcode.
