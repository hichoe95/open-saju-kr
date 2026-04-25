DO $$
DECLARE
    v_table_name text;
    v_row_count bigint;
    v_non_empty_table text;
    v_unexpected_vector_target text;
BEGIN
    FOREACH v_table_name IN ARRAY ARRAY['matching_profiles', 'matching_embeddings', 'matching_interactions', 'profile_views']
    LOOP
        IF to_regclass(format('public.%s', v_table_name)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format('SELECT COUNT(*) FROM public.%I', v_table_name) INTO v_row_count;
        IF v_row_count > 0 THEN
            v_non_empty_table := v_table_name;
            EXIT;
        END IF;
    END LOOP;

    IF v_non_empty_table IS NOT NULL THEN
        RAISE EXCEPTION 'Refusing to remove matching prototype because % has data', v_non_empty_table;
    END IF;

    SELECT format('%I.%I.%I', table_schema, table_name, column_name)
    INTO v_unexpected_vector_target
    FROM information_schema.columns
    WHERE udt_name = 'vector'
      AND NOT (
          table_schema = 'public'
          AND table_name = 'matching_embeddings'
          AND column_name IN ('identity_vector', 'preference_vector')
      )
    LIMIT 1;

    IF v_unexpected_vector_target IS NOT NULL THEN
        RAISE EXCEPTION 'Refusing to drop vector extension because unexpected vector column exists: %', v_unexpected_vector_target;
    END IF;
END $$;

DROP TABLE IF EXISTS public.profile_views;
DROP TABLE IF EXISTS public.matching_interactions;
DROP TABLE IF EXISTS public.matching_embeddings;
DROP TABLE IF EXISTS public.matching_profiles;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE udt_name = 'vector'
    ) THEN
        RAISE EXCEPTION 'Refusing to drop vector extension because vector columns still remain';
    END IF;
END $$;

DROP EXTENSION IF EXISTS vector;

NOTIFY pgrst, 'reload schema';
