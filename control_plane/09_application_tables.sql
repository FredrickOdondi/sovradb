-- ============================================================================
-- 09_application_tables.sql
-- Create generic application tables to replace the Studio dashboard mocks
-- ============================================================================

-- 1. Create Posts table
CREATE TABLE public.posts (
    id UUID NOT NULL DEFAULT uuidv7(),
    user_region_code VARCHAR(2) NOT NULL,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Temporal tracking columns
    sys_period tstzrange NOT NULL DEFAULT tstzrange(now(), 'infinity'),
    PRIMARY KEY (id),
    CONSTRAINT fk_posts_user FOREIGN KEY (user_region_code, user_id) REFERENCES public.sovereign_users(region_code, id) ON DELETE CASCADE
);

-- 2. Create Temporal History Table for Posts
CREATE TABLE public.posts_history (LIKE public.posts);

-- 3. Add Temporal Trigger for Posts
CREATE TRIGGER versioning_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION save_history();

-- 4. Create Likes table
CREATE TABLE public.likes (
    id UUID NOT NULL DEFAULT uuidv7(),
    post_id UUID NOT NULL,
    user_region_code VARCHAR(2) NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_likes_user FOREIGN KEY (user_region_code, user_id) REFERENCES public.sovereign_users(region_code, id) ON DELETE CASCADE,
    CONSTRAINT uq_likes_post_user UNIQUE (post_id, user_region_code, user_id)
);
