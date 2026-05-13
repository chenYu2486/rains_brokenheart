-- ═══════════════════════════════════════════════════════════════
-- 避雨檐 ShelterAI — 数据库迁移 001
-- 在 Supabase SQL Editor 中执行
-- ═══════════════════════════════════════════════════════════════

-- 0. 扩展（用于生成 UUID）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══ 1. 用户基础资料 ═══
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_own_profile_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_own_profile_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ═══ 2. 会话 ═══
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT DEFAULT '',
    phase TEXT DEFAULT 'idle' CHECK (phase IN ('idle','intake','therapy')),
    tags TEXT[] DEFAULT '{}',
    features TEXT[] DEFAULT '{}',
    warmup_profile JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_conversations_select" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_conversations_insert" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_conversations_update" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_conversations_delete" ON conversations FOR DELETE USING (auth.uid() = user_id);

-- ═══ 3. 消息 ═══
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content TEXT NOT NULL DEFAULT '',
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at ASC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_messages_select" ON messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_messages_insert" ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_messages_delete" ON messages FOR DELETE USING (auth.uid() = user_id);

-- ═══ 4. 评估报告 ═══
CREATE TABLE IF NOT EXISTS reports (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    stage TEXT DEFAULT '',
    stress INT DEFAULT 0,
    friction INT DEFAULT 0,
    risk INT DEFAULT 0,
    resilience INT DEFAULT 0,
    warning_level TEXT DEFAULT 'low' CHECK (warning_level IN ('low','medium','high','critical')),
    core_issue TEXT DEFAULT '',
    cognitive_pattern TEXT DEFAULT '',
    support_focus TEXT DEFAULT '',
    recommended_style TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    next_steps JSONB DEFAULT '[]',
    crisis_signals JSONB DEFAULT '[]',
    trend TEXT DEFAULT '',
    follow_up TEXT DEFAULT '',
    full_report JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_conv ON reports(conversation_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_reports_select" ON reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_reports_insert" ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_reports_delete" ON reports FOR DELETE USING (auth.uid() = user_id);

-- ═══ 5. 长期记忆 ═══
CREATE TABLE IF NOT EXISTS memories (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('preference','concern','background','risk','resource','taboo')),
    content TEXT NOT NULL DEFAULT '',
    confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    source TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(is_active);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_memories_select" ON memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_memories_insert" ON memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_memories_update" ON memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_memories_delete" ON memories FOR DELETE USING (auth.uid() = user_id);

-- ═══ 6. 用户设置 ═══
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    use_mode TEXT DEFAULT 'proxy' CHECK (use_mode IN ('proxy','direct')),
    api_base TEXT DEFAULT '',
    assess_model TEXT DEFAULT '',
    therapy_model TEXT DEFAULT '',
    rag_enabled BOOLEAN DEFAULT true,
    enable_music BOOLEAN DEFAULT true,
    enable_thinking BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_settings_select" ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings_insert" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_settings_update" ON settings FOR UPDATE USING (auth.uid() = user_id);
