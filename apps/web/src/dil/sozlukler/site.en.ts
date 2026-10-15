/**
 * TANITIM SİTESİNİN İNGİLİZCE METNİ. Yapı `site.tr.ts` ile BİRE BİR aynı
 * (`Sozluk<SiteMetni>`): kısa adlar (slug), bağlantılar ve özellik
 * listeleri iki dilde AYNI değerde olmalı, `sozluk-anahtarlari.spec.ts`
 * bunu da kontrol ediyor. Yazım kuralları Türkçesiyle aynı: okuyan
 * reklamcılık bilmiyor, kısa cümle, uzun tire yok, yalnız bugün yapılan iş.
 * Terimler `docs/i18n/SOZLUK.md`.
 */
import type { Sozluk } from '@advetics/shared';
import { AJANS, DENEME_GUN, YILLIK_INDIRIM_YUZDE, donemFiyatiSent, usd } from '@/components/landing/fiyat';
import { talepAdresi } from '@/components/landing/iletisim';
import type { SiteMetni } from './site.tr';

export const SITE_EN: Sozluk<SiteMetni> = {
  DEMO_MAILTO: talepAdresi(
    'Advetics demo request',
    'Hello,\n\nI would like an Advetics demo.\n\n' +
      'Company name:\n' +
      'Where we advertise (Meta, Google, LinkedIn):\n' +
      'Are we an agency or a business:\n',
  ),

  OZELLIKLER: [
    {
      slug: 'tek-panel',
      ad: 'One Panel',
      panelAdi: 'Overview, Ads Manager, Leads',
      kisa: 'Your Meta, Google and LinkedIn ads on one screen, in one language.',
      baslik: 'All your ads on one screen',
      ozet:
        'No need to open a separate panel for Facebook, Instagram, Google and LinkedIn. ' +
        'Advetics connects your accounts and puts the numbers side by side, in the same terms.',
      faydalar: [
        {
          baslik: 'See what you spend at a glance',
          metin:
            'Overview shows how much you spent in the selected period, how many people you reached ' +
            'and how many results you got, on a single page.',
        },
        {
          baslik: 'Drill down from big to small',
          metin:
            'Ads Manager starts at the company: account, campaign, ad. At each step you go one ' +
            'level down and find which ad is spending the money.',
        },
        {
          baslik: 'See the ad itself',
          metin:
            'Next to the number you see the ad image or text. You never have to guess which ' +
            'number belongs to which ad.',
        },
        {
          baslik: 'Form fills in one list',
          metin:
            'People who fill in the form in your Meta ads are collected on the Leads screen. ' +
            'You do not hunt for them platform by platform.',
        },
      ],
      adimlar: [
        {
          baslik: 'Connect your account',
          metin:
            'You sign in with your Meta, Google or LinkedIn account and grant permission. ' +
            'You never share your password with Advetics.',
        },
        {
          baslik: 'Assign the account to a company',
          metin:
            'You choose once which ad account belongs to which company. ' +
            'Data for the last 90 days starts arriving right away.',
        },
        {
          baslik: 'Watch',
          metin: 'From then on, data is pulled from the platforms automatically at regular intervals.',
        },
      ],
      sinirlar: ['LinkedIn ads are tracked and reported. Creating LinkedIn ads is not available yet.'],
    },
    {
      slug: 'reklam-kurma',
      ad: 'Ad Creation',
      panelAdi: 'AdvCampaign',
      kisa: 'Tell it what you want to sell. Advetics builds the setup, you approve it.',
      baslik: 'You describe the ad, Advetics builds it',
      ozet:
        'AdvCampaign prepares your ad by talking with you. It does not ask about technical ' +
        'settings like who sees it, where it appears or bidding; it picks the best option itself. ' +
        'It shows you everything before going live.',
      faydalar: [
        {
          baslik: 'No technical questions',
          metin:
            'You do not need to know campaign objectives, placements or bid strategies. ' +
            'You are asked about your business: what you sell, to whom, and with what budget.',
        },
        {
          baslik: 'Your image fits everywhere',
          metin:
            'Instagram stories need vertical images, the feed needs square ones. It completes the ' +
            'missing sizes of your image, so every placement gets the right size.',
        },
        {
          baslik: 'Preview first, then publish',
          metin:
            'You see how the ad will look before it goes live. Nothing is published without ' +
            'your approval.',
        },
        {
          baslik: 'On Facebook, Instagram and Google',
          metin:
            'On Google there are three paths: Search (a text ad shown to people searching on Google), ' +
            'Demand Gen (image ads in places like YouTube and Gmail) and Performance Max ' +
            "(one campaign across all of Google's surfaces). AdvCampaign suggests which one fits.",
        },
      ],
      adimlar: [
        {
          baslik: 'Describe',
          metin: 'Write about your product, who you want to sell to and your budget, in your own words.',
        },
        {
          baslik: 'Add your image',
          metin:
            'If you drop an image that cannot be used, it tells you the moment you drop it, ' +
            'not during publishing.',
        },
        {
          baslik: 'Preview',
          metin: 'Check the campaign to be created and how the ads will look.',
        },
        {
          baslik: 'Approve',
          metin:
            'With your approval it is created on the platform. After setup, the state on the ' +
            'platform is read back and compared with what you approved.',
        },
      ],
      sinirlar: [
        'Ad creation for LinkedIn is not available. LinkedIn ads are tracked and reported.',
        "Adding a payment method to an ad account is done on the platform's own screen.",
      ],
    },
    {
      slug: 'planlama',
      ad: 'Planning',
      panelAdi: 'AdvStrategy, Monthly Budget',
      kisa: 'A plan at the start of the month, budget tracking all month. Suggestions from your past data.',
      baslik: 'Have your plan ready before the month starts',
      ozet:
        'AdvStrategy prepares your monthly ad plan and suggests how much of the budget should go ' +
        'to each platform, based on your past results. The Monthly Budget screen shows whether ' +
        'spending is behind or ahead of the plan during the month.',
      faydalar: [
        {
          baslik: 'A ready suggestion for where the budget goes',
          metin:
            'It looks at which platform brought you results more cheaply in the past and suggests ' +
            'splitting the budget accordingly. The final decision is yours.',
        },
        {
          baslik: 'Which words people use to find you',
          metin:
            'It shows which words related to your business are searched on Google and roughly how ' +
            'often. The numbers are approximate values provided by Google.',
        },
        {
          baslik: 'The client approves the plan in the panel',
          metin:
            'If you are an agency, you do not email the plan and wait for an answer. Your client ' +
            'sees the plan in their own panel and approves it. The plan can also be downloaded as a PDF.',
        },
        {
          baslik: 'Spending pace',
          metin:
            'Monthly Budget shows side by side how much of the budget should have been spent by ' +
            'this day of the month and how much actually was.',
        },
      ],
      adimlar: [
        { baslik: 'Enter the month and budget', metin: 'Write which month it is for and how much you want to spend in total.' },
        {
          baslik: 'Review the suggestion',
          metin: 'The plan comes with a budget split and keyword suggestions. Change anything you like.',
        },
        {
          baslik: 'Approve',
          metin: 'Once the plan is approved you go straight to ad setup.',
        },
        { baslik: 'Track', metin: 'During the month, follow spending on the Monthly Budget screen.' },
      ],
    },
    {
      slug: 'akilli-boost',
      ad: 'Smart Boost',
      panelAdi: 'Smart Boost',
      kisa: 'Suggests boosting your new Instagram and YouTube posts and publishes with your approval.',
      baslik: 'Let your new post reach more people',
      ozet:
        'When you post something new on Instagram or YouTube, Smart Boost notices it and ' +
        'prepares a boost suggestion. Boosting means showing the post, with a small budget, to ' +
        'people who do not follow you. If you approve, the post becomes an ad.',
      faydalar: [
        {
          baslik: 'No need to keep watch',
          metin: 'New posts are checked regularly. A suggestion card is created for each new post.',
        },
        {
          baslik: 'No spending without approval',
          metin: 'The card waits for your approval. No money is spent until you approve.',
        },
        {
          baslik: 'Set it up once',
          metin: 'You set the budget and duration once. Every suggestion comes with these settings.',
        },
        {
          baslik: 'No two campaigns for the same content',
          metin:
            'If your Instagram post also appears on your Facebook page, a second card is not created. ' +
            'Money is not spent twice on the same content.',
        },
      ],
      adimlar: [
        { baslik: 'Connect your account', metin: 'Connect your Instagram or YouTube account to your company.' },
        { baslik: 'Choose your settings', metin: 'Set the budget and duration to use for boosting.' },
        { baslik: 'Post', metin: 'Post as usual. The suggestion card is created automatically.' },
        { baslik: 'Approve', metin: 'Approve the card and the post goes live as an ad.' },
      ],
      sinirlar: [
        'No suggestion cards are created for Facebook page posts. You can boost them manually from the panel.',
      ],
    },
    {
      slug: 'iyilestirme',
      ad: 'Optimization',
      panelAdi: 'Optimize, Rules',
      kisa: 'Tells you what is going wrong and fixes it with your approval. Rules work even when you are away.',
      baslik: 'It tells you what to do and does it with your approval',
      ozet:
        'The Optimize screen looks at your ads and writes in plain words what needs fixing. ' +
        'If you like a suggestion, you click "Apply": pausing an ad or changing the budget ' +
        'takes one click.',
      faydalar: [
        {
          baslik: 'Suggestion and Apply button',
          metin:
            'Every suggestion says why it is made. The Apply button makes the change directly on ' +
            'the platform, so you do not need to go to the platform yourself.',
        },
        {
          baslik: 'Your own rules',
          metin:
            'You write rules like "pause an ad if it brings no results for three days". ' +
            'Rules are checked every hour.',
        },
        {
          baslik: 'Spots a tired ad',
          metin:
            'When the same people see the same ad too often, interest drops. Advetics notices this ' +
            'in Meta ads and tells you it is time to refresh the ad.',
        },
        {
          baslik: 'Ask the assistant',
          metin:
            'You can ask the AI assistant inside the panel a question like ' +
            '"Why is it more expensive this week?".',
        },
      ],
      adimlar: [
        { baslik: 'Read the suggestion', metin: 'Each suggestion states what to do and why in one sentence.' },
        { baslik: 'Apply', metin: 'Apply the suggestions you like with one click and skip the rest.' },
        { baslik: 'Create a rule', metin: 'Turn recurring tasks into rules that run automatically every hour.' },
      ],
      yakinda: [
        {
          baslik: 'Sudden change alerts',
          metin: 'Notifying you via Slack, Teams or email when spend or results change unexpectedly.',
        },
        {
          baslik: 'Account health checks',
          metin: 'Warning you automatically when there is a problem with tracking or account settings.',
        },
        {
          baslik: 'Weekly summary email',
          metin: 'A short email explaining how the week went and what you should look at.',
        },
        {
          baslik: 'Impact of applied suggestions',
          metin: 'Measuring how results changed after you applied a suggestion.',
        },
        {
          baslik: 'Creative analysis',
          metin: 'Showing which image and text work better, and why.',
        },
      ],
    },
    {
      slug: 'raporlama',
      ad: 'Reporting',
      panelAdi: 'Reports',
      kisa: 'PDF reports in your brand color, scheduled emails and share links.',
      baslik: 'The month-end report is ready by itself',
      ozet:
        'The Reports screen prepares the report for the period you select. You download it as a ' +
        'PDF, share it as a link, or have it emailed automatically every week or month.',
      faydalar: [
        {
          baslik: 'Ready-made templates',
          metin:
            'Pick one of the ready-made templates, or reorder the sections and save your own ' +
            'template.',
        },
        {
          baslik: 'Scheduled email',
          metin: 'Set up a weekly or monthly schedule. The report goes to the people you choose with a PDF attached.',
        },
        {
          baslik: 'Share link',
          metin: 'Share the report with a link. The person opening it does not need to sign in.',
        },
        {
          baslik: 'Invoice attachments',
          metin: 'Attach platform invoices to the period. The report email goes out with the invoices.',
        },
        {
          baslik: 'Your brand color',
          metin: 'PDF reports carry your brand color. The panel also opens with your logo and color.',
        },
        {
          baslik: 'What the ad says is in the report too',
          metin:
            'Top ads appear together with their numbers: the image of an image ad, ' +
            'the text of a search ad.',
        },
      ],
      adimlar: [
        { baslik: 'Choose the period', metin: 'Last month, this month, or any two dates you like.' },
        { baslik: 'Choose the template', metin: 'Choose which sections the report has and in which order.' },
        { baslik: 'Send', metin: 'Download it, share the link, or connect it to a scheduled email.' },
      ],
    },
    {
      slug: 'olcum-kurulumu',
      ad: 'Tracking Setup',
      panelAdi: 'Brand Center',
      kisa: 'Shows step by step the setup needed to count sales and forms from your ads correctly.',
      baslik: 'Count the results your ads bring, correctly',
      ozet:
        'To know whether an ad works, your website needs to have what counts as a "result" set up. ' +
        'The setup guide in Brand Center shows what is missing and helps you complete it.',
      faydalar: [
        {
          baslik: 'See what is missing',
          metin:
            'For Meta Pixel, Google Ads conversions, Google Tag Manager and Google Analytics 4, ' +
            'one list shows which is installed and which is missing. All four are tools that count ' +
            'what people do on your site after an ad.',
        },
        {
          baslik: 'Each project separate',
          metin:
            'If a company has several projects, each project is tracked separately. ' +
            'The numbers never mix.',
        },
        {
          baslik: 'A sale is never counted twice',
          metin:
            'If a result of the same type is already being counted, it does not create a new one. ' +
            'Double counting makes an ad look better than it is.',
        },
        {
          baslik: 'Brand details in one place',
          metin:
            'Logo, contact details, audiences and images live in Brand Center. When you create ' +
            'an ad they come from there, so you do not enter them again and again.',
        },
      ],
      adimlar: [
        { baslik: 'Open the guide', metin: 'The first section of Brand Center is the setup guide.' },
        { baslik: 'Review what is missing', metin: 'See what is done and what is missing for accounts and tracking tools.' },
        { baslik: 'Complete', metin: 'Close the gaps with the steps the guide shows, then verify.' },
      ],
      sinirlar: [
        "Opening an ad account and adding a payment method are done on the platform's own screen.",
        'If someone else prepared a change in Tag Manager and did not publish it, it will not publish that change for you.',
      ],
    },
    {
      slug: 'yapay-zeka-asistani',
      ad: 'AI Assistant',
      panelAdi: 'Assistant and MCP connection',
      kisa: 'Ask questions about your ads and get suggestions. Connect assistants like Claude to your data.',
      baslik: 'Ask your ads a question, get the answer from your own data',
      ozet:
        'You can ask the assistant inside the panel "which ad brought the most results this month?". ' +
        'If you like, you can also connect AI assistants like Claude to your Advetics data. ' +
        'This connection only reads; it cannot make changes.',
      faydalar: [
        {
          baslik: 'Plain question, plain answer',
          metin: 'You do not need to know how to read a report. Ask what you want to know in your own words.',
        },
        {
          baslik: 'Get suggestions',
          metin: 'The assistant suggests what could be improved. Applying it still takes your approval.',
        },
        {
          baslik: 'Connect your own assistant',
          metin:
            'Advetics supports an open standard (MCP) that AI assistants use to connect to data. ' +
            'An assistant like Claude can read your reports.',
        },
        {
          baslik: 'The connection only reads',
          metin: 'This connection cannot create ads, pause them or change budgets. It only reads.',
        },
      ],
      adimlar: [
        { baslik: 'Ask', metin: 'Open the assistant in the panel and type your question.' },
        { baslik: 'Read', metin: 'The answer comes from your own data in Advetics.' },
        { baslik: 'Decide', metin: 'If you want to apply a suggestion, the approval is still yours.' },
      ],
      sinirlar: [
        'Answers are based on data that has reached Advetics. A change you just made on the platform may not show up until the next update.',
      ],
    },
  ],

  COZUMLER: [
    {
      slug: 'isletmeler',
      ad: 'Small businesses',
      kisa: 'One account, ads without an agency',
      baslik: 'Advertise even if you know nothing about ads',
      ozet:
        'If you want to see and manage your ads yourself, Advetics asks you plain questions ' +
        'instead of technical terms and puts every suggestion up for your approval.',
      maddeler: [
        {
          baslik: 'No technical settings',
          metin:
            'Advetics picks settings like targeting, placement and bidding. You are only asked ' +
            'about your business.',
        },
        {
          baslik: 'Know what you spend',
          metin:
            'You see on one screen how much was spent this month and how many forms, messages ' +
            'or sales came in return.',
        },
        {
          baslik: 'It tells you what to do',
          metin:
            'It suggests pausing ads that bring no results and growing the ones that work. ' +
            'If you click "Apply", it does it.',
        },
        {
          baslik: 'Your accounts stay yours',
          metin:
            'Your ad accounts belong to you. Advetics connects to them with your permission and ' +
            'you can remove the connection at any time.',
        },
      ],
      ozellikler: ['reklam-kurma', 'akilli-boost', 'iyilestirme', 'olcum-kurulumu'],
      senaryo: {
        baslik: "Example: a café owner's week",
        adimlar: [
          'Connects their Instagram account to Advetics.',
          'Posts the new menu. Smart Boost suggests boosting the post, and they approve.',
          'Describes the weekend breakfast to AdvCampaign: "Show our weekend breakfast to people living near the café."',
          'A few days later, Optimize suggests pausing an ad that brings no results. They apply it with one click.',
        ],
      },
    },
    {
      slug: 'sirketler',
      ad: 'Companies',
      kisa: 'Multiple projects and teams',
      baslik: "Each project's ads kept apart, all in one panel",
      ozet:
        'For companies with several brands or projects. Each project keeps its own ad accounts, ' +
        'tracking and reports; your marketing team manages them all from one place.',
      maddeler: [
        {
          baslik: 'Each project in its own space',
          metin:
            'Each project has its own Meta and Google Ads account, Tag Manager container and ' +
            "Analytics property. One project's numbers never mix with another's.",
        },
        {
          baslik: 'All projects at a glance',
          metin:
            'Overview and Ads Manager start at the company: first all projects, then the ' +
            'campaigns of the project you select.',
        },
        {
          baslik: 'Team and permissions',
          metin:
            'You give your team roles. Who changed what and when is recorded.',
        },
        {
          baslik: 'The plan goes to approval first',
          metin:
            'The month plan is prepared with AdvStrategy and is not turned into campaigns until ' +
            'approved. Approval can also be given through a link that needs no sign-in.',
        },
        {
          baslik: 'The budget ceiling is protected',
          metin:
            'Rules check every hour. They do not apply a change that would exceed the monthly budget.',
        },
        {
          baslik: 'Reports go out by themselves',
          metin: "Each project's report is emailed to the right people on the scheduled day, together with the invoices.",
        },
      ],
      ozellikler: ['tek-panel', 'planlama', 'olcum-kurulumu', 'raporlama'],
      senaryo: {
        baslik: 'Example: a month at a construction company with three housing projects',
        adimlar: [
          'A separate workspace is opened for each project; ad accounts and tracking are connected to each project separately.',
          'At the start of the month the plans for all three projects are prepared in AdvStrategy, and the general manager approves them via a link.',
          'Campaigns are created with AdvCampaign; rules watch the budget ceiling and cost per form.',
          "At the end of the month each project's report goes to its own recipients automatically.",
        ],
      },
    },
    {
      slug: 'ajanslar',
      ad: 'Agencies',
      kisa: 'A workspace per client, white label',
      baslik: 'All your clients in one panel, each in their own space',
      ozet:
        "Advetics is an ad panel that opens with your agency's brand. You manage your clients' " +
        'accounts from one place, and each client sees only their own panel.',
      maddeler: [
        {
          baslik: 'Each client separate',
          metin:
            "One client's data is never visible to another. This separation is enforced in the " +
            'database itself, not on the screen.',
        },
        {
          baslik: 'Clients see their own panel',
          metin:
            'Your client sees the Overview, Ads Manager, AdvStrategy and Reports screens. ' +
            'They approve the plan in the panel but cannot change the ads.',
        },
        {
          baslik: 'Connect once, distribute accounts',
          metin:
            "Your agency's Meta and Google connection is set up once. You assign accounts to " +
            'clients, and data starts arriving the moment you assign them.',
        },
        {
          baslik: 'Clients can connect their own account too',
          metin:
            'A client who wants to manage their ad account themselves sets up their own connection. ' +
            'Those accounts stay only in their company.',
        },
        {
          baslik: 'Your brand',
          metin: 'The panel opens with your logo and color. PDF reports carry your brand color.',
        },
        {
          baslik: 'Team and permissions',
          metin: 'You give your team roles. Who changed what and when is recorded.',
        },
      ],
      ozellikler: ['tek-panel', 'planlama', 'raporlama', 'iyilestirme'],
      senaryo: {
        baslik: 'Example: a month at an agency with twelve clients',
        adimlar: [
          'At the start of the month a plan is prepared in AdvStrategy for each client. The client approves it in their own panel.',
          'The campaigns of the approved plan are created with AdvCampaign.',
          'During the month, Optimize suggestions and rules watch the accounts. The team only approves suggestions.',
          'At the end of the month reports are emailed to clients automatically, together with the invoices.',
        ],
      },
    },
  ],

  ENTEGRASYON_GRUPLARI: [
    {
      baslik: 'Ad platforms',
      aciklama: 'Your ad accounts live on these platforms. Advetics connects to them with your permission.',
      ogeler: [
        {
          ad: 'Meta',
          alt: 'Facebook and Instagram',
          ne: 'Tracking, reporting, ad creation, post boosting and lead form entries.',
        },
        {
          ad: 'Google Ads',
          alt: 'Search, YouTube, Gmail and more',
          ne: 'Tracking, reporting, ad creation and keyword research.',
        },
        { ad: 'LinkedIn Ads', ne: 'Tracking and reporting.' },
        { ad: 'YouTube', ne: 'Boost suggestions for your new videos (Smart Boost).' },
      ],
    },
    {
      baslik: 'Tracking',
      aciklama: 'Tools that count what happens on your site after an ad. The setup guide checks them.',
      ogeler: [
        { ad: 'Meta Pixel', ne: 'Tells Meta what visitors do on your site.' },
        { ad: 'Google Ads conversions', ne: 'Reports results like sales or forms to Google Ads.' },
        { ad: 'Google Tag Manager', ne: 'Manages the tracking code on your site from one place.' },
        { ad: 'Google Analytics 4', ne: 'Visitor statistics for your site.' },
      ],
    },
    {
      baslik: 'AI',
      aciklama: 'Assistants that can read your data. The connection is read-only.',
      ogeler: [{ ad: 'MCP', alt: 'Claude and similar assistants', ne: 'Shares your ad data with read-only permission.' }],
    },
  ],

  YAKINDA_ENTEGRASYONLAR: [
    'Google Search Console',
    'Google Analytics 4 reports',
    'Google Merchant Center',
    'Meta Catalog',
    'Shopify',
    'ikas',
    'Ticimax',
    'Slack notifications',
    'Microsoft Teams notifications',
  ],

  SENARYOLAR: [
    {
      kim: 'A café owner',
      dert: 'Posts on Instagram, but nobody outside their followers sees it.',
      cozum: 'Smart Boost prepares a suggestion for every new post. They just approve.',
      ozellik: 'akilli-boost',
    },
    {
      kim: 'A real estate office',
      dert: 'Wants to appear for people searching "apartment for sale" on Google, but is afraid of the ad panel.',
      cozum:
        'They tell AdvCampaign what they sell and a search ad is created. People who fill in the form land in the Leads list.',
      ozellik: 'reklam-kurma',
    },
    {
      kim: 'An ad agency',
      dert: 'At the end of every month, collects numbers from ten different panels to build reports.',
      cozum: 'Reports are emailed automatically. The team spends its time on optimization, not reporting.',
      ozellik: 'raporlama',
    },
  ],

  GUVENLIK: [
    {
      baslik: "Each company's data kept apart",
      metin:
        "One company's ad data is never visible to another company. This rule is enforced not only " +
        'on the screen but in the database where the data lives. Even if the screen had a bug, ' +
        "the database would not return another company's rows.",
      teknik: 'PostgreSQL row-level security (RLS).',
    },
    {
      baslik: 'We never ask for your password',
      metin:
        "Your Meta, Google and LinkedIn accounts are connected through the platforms' own " +
        'permission screens. Your password never reaches Advetics. You can also revoke the ' +
        "permission from the platform's settings.",
      teknik: 'Authorization via OAuth.',
    },
    {
      baslik: 'Connection keys are encrypted',
      metin:
        'The access keys the platforms issue are written to the database encrypted. They are ' +
        'never stored as plain text.',
      teknik: 'Access tokens in encrypted columns.',
    },
    {
      baslik: 'The AI connection only reads',
      metin:
        'When you connect an assistant like Claude to your data, it cannot create ads, pause them ' +
        'or change budgets.',
      teknik: 'The MCP connection is read-only.',
    },
    {
      baslik: 'Everyone sees only what they need',
      metin:
        'You give roles to your team and clients. A client account can see the ads but ' +
        'cannot change them.',
      teknik: 'Role-based access control.',
    },
    {
      baslik: 'Who changed what is recorded',
      metin: 'Changes made in the panel are recorded together with who made them and when.',
      teknik: 'Audit log.',
    },
  ],

  FIYAT_SORULARI: [
    {
      baslik: 'Is my ad budget paid through Advetics?',
      metin:
        'No. The budget is paid directly to Meta, Google and LinkedIn with your own payment method. ' +
        'You only pay Advetics a subscription.',
    },
    {
      baslik: 'Why are prices in dollars?',
      metin:
        'Our infrastructure and AI costs are in dollars. Payment is taken in TRY at the day\'s ' +
        'exchange rate, and VAT is shown separately on the invoice.',
    },
    {
      baslik: 'How is the Agency plan priced?',
      metin:
        `The base price includes ${AJANS.dahilWorkspace} workspaces. ` +
        `Each additional client workspace from ${AJANS.dahilWorkspace + 1} to ${AJANS.kademeUst} adds ` +
        `${usd(AJANS.kademeBirSent)} per month, and from workspace ${AJANS.kademeUst + 1} onward each adds ` +
        `${usd(AJANS.kademeIkiSent)}. The number of users is unlimited.`,
    },
    {
      baslik: 'What changes with annual billing?',
      metin:
        `Annual billing gives a ${YILLIK_INDIRIM_YUZDE}% discount on all plans: the Agency base ` +
        `drops to ${usd(donemFiyatiSent(AJANS.tabanSent, 'yil'))} per month. The amount is billed yearly.`,
    },
    {
      baslik: `How does the ${DENEME_GUN}-day free trial work?`,
      metin:
        `You can try the Small Business and Company plans free for ${DENEME_GUN} days. The button ` +
        'opens an email to us; we set up your account. For the Agency plan we make an offer based on your needs.',
    },
    {
      baslik: 'Do my accounts stay mine?',
      metin:
        'Yes. Advetics connects to your accounts with permission; when you end the subscription the ' +
        'connection is removed and your accounts stay exactly as they are.',
    },
    {
      baslik: 'Can I see it first?',
      metin: "Request a demo; let's look at it together with your own account in 30 minutes.",
    },
  ],

  MODUL_BOLUMLERI: [
    {
      slug: 'tek-panel',
      ust: 'One Panel',
      baslik: 'Three platforms, one table. Same language.',
      metin:
        'Meta says "result", Google says "conversion", LinkedIn says "lead". Advetics shows them all ' +
        'under the same name and date range, so you see at a glance which campaign makes money.',
      maddeler: [
        'Drill down: company → project → campaign → ad',
        'Every list shows how many are displayed and the total',
        'Pause and change budgets right from the row',
      ],
    },
    {
      slug: 'reklam-kurma',
      ust: 'Ad Creation · AdvCampaign',
      baslik: 'Say what you want. Let it pick the setup.',
      metin:
        'No questions about objectives, placements or bid strategies. Saying "I want many people in ' +
        'my area to see it" or "I want them to message me on WhatsApp" is enough; the best setup is ' +
        'chosen and the preview comes to you for approval.',
      maddeler: [
        'Sales, leads, messages, video and reach objectives',
        'Reads the setup back from the platform and reports any difference',
        'Setups start paused; you switch them on',
      ],
    },
    {
      slug: 'planlama',
      ust: 'Planning · AdvStrategy',
      baslik: 'The strategy report is built step by step, and the client approves it via a link.',
      metin:
        'Goal, budget, region and audience are chosen; the budget is split across platforms and you ' +
        'get a report that can also be downloaded as a PDF. The client approves through a link without ' +
        'signing in, and the plan becomes campaigns with one click.',
      maddeler: [
        'Makes no guesses when there is no past data',
        'Approvals are stored with name and email',
        'Every item flows into a single setup guide',
      ],
    },
    {
      slug: 'akilli-boost',
      ust: 'Smart Boost',
      baslik: 'Share the post. Let it prepare the boost.',
      metin:
        'When new content appears on Instagram or YouTube, a card is prepared with a suggested ' +
        'audience, budget and duration. If you approve, it becomes an ad, with one click.',
      maddeler: [
        'The same content is never boosted twice',
        'Can also run fully automatically with a preset',
        'Switches itself off when done',
      ],
    },
    {
      slug: 'iyilestirme',
      ust: 'Optimization · Rules',
      baslik: 'Write the rule once. Let it work at night too.',
      metin:
        '"Pause if cost per lead goes above ₺250", "warn me when 90% of the monthly budget is spent". ' +
        'Rules check every hour and record everything they do with the reason.',
      maddeler: [
        'Shows what it would do first, then you switch it on',
        'Refuses decisions that would exceed the monthly budget ceiling',
        'Every action is recorded and can be undone',
      ],
    },
    {
      slug: 'raporlama',
      ust: 'Reporting',
      baslik: "At the start of the month, the report is in the client's inbox.",
      metin:
        'Choose the template once: cover, summary, campaigns, top ads, audience. The PDF is ' +
        'produced in your brand color and goes out on the scheduled day with the invoices.',
      maddeler: [
        'The report on screen and the PDF are the same document',
        'Turkish characters and ₺ render correctly',
        'Recipients it did not reach are listed separately',
      ],
    },
    {
      slug: 'olcum-kurulumu',
      ust: 'Tracking Setup',
      baslik: 'Pixel, Tag Manager, Analytics. One list, one counter.',
      metin:
        'The wizard lists what is missing for the company and each project: which account is not ' +
        'connected, which conversion is not tracked. When you click "Complete missing items" it ' +
        'sets up everything it can.',
      maddeler: [
        'Never creates an existing conversion twice',
        'Never takes account-opening steps on its own',
        'Does not ask website steps of those who say "we have no website"',
      ],
    },
    {
      slug: 'yapay-zeka-asistani',
      ust: 'AI Assistant',
      baslik: 'Ask. Get an answer in numbers.',
      metin:
        'Ask "why did it get more expensive last month?"; the assistant looks at your own data, ' +
        'states the reason in numbers and suggests what to do. Doing it still takes your approval.',
      maddeler: [
        'Works with read-only access',
        'Never makes things up: if there is no data, it says "no data"',
        'Connects to Claude and other assistants via MCP',
      ],
    },
  ],

  BAGLANDIGI_YERLER: ['Meta', 'Instagram', 'Google Ads', 'YouTube', 'LinkedIn Ads', 'GA4', 'Tag Manager'],

  NASIL_CALISIR: [
    {
      baslik: 'Connect',
      metin: 'Authorize your Meta, Google and LinkedIn accounts once. We never ask for passwords.',
    },
    {
      baslik: 'Describe',
      metin: 'Write about your business and what you want; the wizard lists what is missing in one list.',
    },
    { baslik: 'Approve', metin: 'The setup preview arrives. You check it and switch it on.' },
    { baslik: 'Watch', metin: 'Rules protect you, and the report goes out by itself once a month.' },
  ],

  GUVENLIK_OZETI: [
    { baslik: 'No passwords', metin: "Connection through the platform's own authorization." },
    { baslik: 'Encrypted keys', metin: 'Access keys are stored encrypted.' },
    { baslik: 'Role-based access', metin: 'A client sees only their own report.' },
    { baslik: 'Every action logged', metin: 'Who changed what and when is written down.' },
  ],

  YASAL_BELGELER: [
    { href: '/gizlilik', etiket: 'Privacy Policy' },
    { href: '/cerez-politikasi', etiket: 'Cookie Policy' },
    { href: '/kosullar', etiket: 'Terms of Use' },
    { href: '/veri-silme', etiket: 'Data Deletion' },
  ],

  UST_MENU: [
    { href: '/entegrasyonlar', etiket: 'Integrations' },
    { href: '/fiyatlandirma', etiket: 'Pricing' },
    { href: '/guvenlik', etiket: 'Security' },
  ],
};
