"""Professional domain taxonomy for ThisWeekSaudi.

Professional events (conference, expo, workshop, meetup) are grouped into
professional domains (AI, HR, finance, ...) so users can browse "AI events"
or "HR events" instead of a flat conference list. Leisure categories
(sports, concert, comedy, arts, festival, music, food) map to a single
'entertainment' domain — they don't need professional grouping.

classify_domain(title, organizer, category) -> domain key. First matching
rule wins; rules run specific -> general. New radar sources must set the
domain explicitly; this classifier is the fallback for legacy records.
"""
import re

DOMAINS = {
    'tech':          {'en': 'AI & Technology', 'ar': 'الذكاء الاصطناعي والتقنية'},
    'finance':       {'en': 'Finance & Investment', 'ar': 'المالية والاستثمار'},
    'hr':            {'en': 'HR & Leadership', 'ar': 'الموارد البشرية والقيادة'},
    'health':        {'en': 'Healthcare', 'ar': 'الرعاية الصحية'},
    'energy':        {'en': 'Energy & Oil', 'ar': 'الطاقة والنفط'},
    'industry':      {'en': 'Manufacturing & Industry', 'ar': 'الصناعة والتصنيع'},
    'build':         {'en': 'Real Estate & Construction', 'ar': 'العقارات والإنشاءات'},
    'legal':         {'en': 'Legal & Compliance', 'ar': 'القانون والامتثال'},
    'marketing':     {'en': 'Marketing & Media', 'ar': 'التسويق والإعلام'},
    'education':     {'en': 'Education & Training', 'ar': 'التعليم والتدريب'},
    'retail':        {'en': 'Retail & E-commerce', 'ar': 'التجزئة والتجارة الإلكترونية'},
    'logistics':     {'en': 'Logistics & Supply Chain', 'ar': 'الخدمات اللوجستية'},
    'foodagri':      {'en': 'Food & Agriculture', 'ar': 'الأغذية والزراعة'},
    'startup':       {'en': 'Startups & VC', 'ar': 'الشركات الناشئة'},
    'sustain':       {'en': 'Sustainability', 'ar': 'الاستدامة'},
    'gov':           {'en': 'Government & Policy', 'ar': 'الحكومة والسياسات'},
    'security':      {'en': 'Security & Defense', 'ar': 'الأمن والدفاع'},
    'auto':          {'en': 'Automotive & Mobility', 'ar': 'السيارات والتنقل'},
    'space':         {'en': 'Space & Aviation', 'ar': 'الفضاء والطيران'},
    'sportsbiz':     {'en': 'Sports Business', 'ar': 'الأعمال الرياضية'},
    'business':      {'en': 'Business & Trade', 'ar': 'أعمال وتجارة'},
    'entertainment': {'en': 'Entertainment', 'ar': 'ترفيه'},
}

PROFESSIONAL_CATS = {'conference', 'expo', 'workshop', 'meetup'}
LEISURE_CATS = {'sports', 'concert', 'comedy', 'arts', 'festival', 'music', 'food'}

# (domain, [regex fragments]) — first match wins. Fragments are matched
# case-insensitively against "title organizer". Short tokens use \b to
# avoid false positives ("ai" must not match "air", "port" not "sport").
RULES = [
    ('startup',   [r'venture capital', r'\bvc\b', r'fundraising', r'investor',
                   r'\bpitch\b', r'startup', r'founder', r'incubat', r'accelerator',
                   r'angel invest']),
    ('health',    [r'health', r'medical', r'medtech', r'pharma', r'dental',
                   r'clinic', r'hospital', r'cardio', r'\bheart\b', r'disability',
                   r'rehabilitation', r'nurs', r'oncology', r'surgery']),
    ('energy',    [r'energy', r'\boil\b', r'\bgas\b', r'petroleum', r'solar',
                   r'renewable', r'\bpower\b', r'petrochemical', r'refining']),
    ('sustain',   [r'sustainab', r'\bgreen\b', r'climate', r'environ', r'\besg\b',
                   r'\bcsr\b', r'carbon', r'waste to value']),
    ('finance',   [r'\bbank\b', r'banking', r'fintech', r'financ', r'\bcfo\b',
                   r'investment', r'insurance', r'capital market', r'payment',
                   r'seamless', r'treasury', r'accounting', r'merger', r'acquisition']),
    ('legal',     [r'legal', r'\blaw\b', r'compliance', r'governance', r'contract',
                   r'procurement', r'arbitration', r'\biso\b', r'audit', r'regulator']),
    ('hr',        [r'\bhr\b', r'human resource', r'talent', r'leadership',
                   r'workforce', r'recruit', r'\bchro\b']),
    ('tech',      [r'artificial intelligence', r'\bai\b', r'data center', r'cloud',
                   r'\bcio\b', r'digital transformation', r'automation', r'software',
                   r'\bit\b', r'cyber', r'robot', r'\bigda\b', r'game dev',
                   r'\btech\b', r'blockchain', r'\biot\b']),
    ('industry',  [r'manufactur', r'industrial', r'factor', r'welding', r'steel',
                   r'fabex', r'machinery', r'\bprint\b', r'packaging', r'paper']),
    ('build',     [r'real estate', r'construction', r'infrastructure', r'architect',
                   r'cityscape', r'housing', r'mega project', r'stadium', r'arena',
                   r'tunnel', r'geotechnical', r'\bhouse\b', r'\bhome\b']),
    ('logistics', [r'logistic', r'maritime', r'\bport\b', r'supply chain', r'freight',
                   r'shipping', r'warehouse']),
    ('retail',    [r'retail', r'e-?commerce', r'shopping', r'franchise']),
    ('foodagri',  [r'\bfood\b', r'foodex', r'beverage', r'agricultur', r'poultry',
                   r'\bfarm\b', r'dairy', r'restaurant', r'coffee', r'culinary']),
    ('education', [r'education', r'training', r'\bschool\b', r'universit',
                   r'academic', r'student', r'\bmba\b', r'\bgess\b']),
    ('marketing', [r'marketing', r'\bmedia\b', r'advertising', r'\bbrand\b',
                   r'creative', r'portfolio', r'influencer']),
    ('security',  [r'security', r'defen[cs]e', r'\bsafety\b', r'intersec']),
    ('auto',      [r'automotive', r'\bevs?\b', r'electric vehicle', r'mobility',
                   r'auto show']),
    ('space',     [r'\bspace\b', r'drone', r'aviation', r'aerospace', r'satellite',
                   r'\buas\b']),
    ('sportsbiz', [r'athlete', r'sports business', r'esports', r'sports management']),
    ('gov',       [r'government', r'polic', r'public sector', r'economic forum',
                   r'municipal', r'vision 2030', r'diplomat']),
]

_RULE_RES = [(d, [re.compile(p, re.I) for p in pats]) for d, pats in RULES]

# Careful manual overrides (title substring, case-insensitive -> domain).
# Audited 2026-09-27 against all 65 records the rules left as generic
# 'business'. Only entries where the title/organizer made the domain clear
# were overridden; genuinely general trade/business records stay 'business'.
# Consulted before RULES so rebuilds keep the curated assignments.
DOMAIN_OVERRIDES = [
    ('certified information privacy professional', 'legal'),
    ('cipp', 'legal'),
    ('kids & toys expo', 'retail'),
    ('vcs across the globe', 'startup'),
    ('a trace of saudi memory', 'entertainment'),
    ('global leaders forum', 'hr'),
    ('kkesh', 'health'),
    ('falcons and hunting exhibition', 'entertainment'),
    ('family medicine symposium', 'health'),
    ('sajex', 'foodagri'),
    ('saudi conversation', 'entertainment'),
    ('gcf annual meeting', 'security'),
    ('arch+desn', 'build'),
    ('product leaders dinner', 'tech'),
    ('revenue collection strategies', 'finance'),
    ('microwave and antenna symposium', 'tech'),
    ('mipim middle east', 'build'),
    ('explore riyadh', 'entertainment'),
    ('proptech summit', 'build'),
    ('customer experience conference', 'marketing'),
    ('debt collection strategies', 'finance'),
    ('fii 10th edition', 'finance'),
    ('new global sport conference', 'sportsbiz'),
    ('idra world congress', 'sustain'),
    ('milset expo-sciences', 'education'),
    ('water regulation forum', 'gov'),
    ('saudi build', 'build'),
    ('saudi elenex', 'energy'),
    ("qs discover master's fair", 'education'),
    ('thoracic society', 'health'),
    ('jewellery salon', 'retail'),
    ('cat show', 'entertainment'),
    ('connected world ksa', 'tech'),
    ('dog village', 'entertainment'),
    ('hyperscale live ksa', 'tech'),
    ('pet & vet expo', 'entertainment'),
    ('saudi statistics forum', 'gov'),
    ('un world data forum', 'gov'),
    ('misk global forum', 'hr'),
    ('print2pack', 'industry'),
    ('geospatial information congress', 'gov'),
    ('ultimate outdoor adventure show', 'entertainment'),
    ('move riyadh', 'auto'),
    ('lift city expo', 'build'),
    ('fire middle east conference', 'security'),
    ('global airports forum', 'space'),
    ('black hat mea', 'security'),
    ('global future projects forum', 'build'),
    ('saudi horeca', 'foodagri'),
    ('mep international conference', 'build'),
    ('international engineering conference (iece', 'industry'),
    ('bio middle east', 'health'),
    ('cidex', 'build'),
    ('cphi middle east', 'health'),
    ('gulf 4p', 'industry'),
    ('natural world expo', 'retail'),
    ('smart grid conference', 'energy'),
    ('saudi makes future', 'industry'),
    ('beauty expo', 'retail'),
    ('china homelife', 'retail'),
    ('deal expo', 'retail'),
]


def classify_domain(title: str = '', organizer: str = '',
                    category: str = '') -> str:
    """Return a domain key for an event."""
    cat = (category or '').lower()
    if cat in LEISURE_CATS:
        return 'entertainment'
    text = f'{title or ""} {organizer or ""}'.lower()
    for sub, domain in DOMAIN_OVERRIDES:
        if sub in text:
            return domain
    if cat in PROFESSIONAL_CATS or not cat:
        for domain, patterns in _RULE_RES:
            if any(p.search(text) for p in patterns):
                return domain
        return 'business'
    # unknown category: try professional rules, else entertainment fallback
    for domain, patterns in _RULE_RES:
        if any(p.search(text) for p in patterns):
            return domain
    return 'business'


def domain_label(key: str, lang: str = 'en') -> str:
    d = DOMAINS.get(key, DOMAINS['business'])
    return d.get(lang, d['en'])
