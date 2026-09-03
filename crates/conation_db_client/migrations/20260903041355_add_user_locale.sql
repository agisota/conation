ALTER TABLE "User"
    ADD COLUMN locale TEXT NOT NULL DEFAULT 'ru';

ALTER TABLE "User"
    ADD CONSTRAINT user_locale_en_or_ru CHECK (locale IN ('en', 'ru'));
