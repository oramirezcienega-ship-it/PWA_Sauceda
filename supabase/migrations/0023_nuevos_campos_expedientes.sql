-- Agregar campos de estado de la casa al expediente
ALTER TABLE public.expedientes
ADD COLUMN IF NOT EXISTS sin_pagos TEXT,
ADD COLUMN IF NOT EXISTS estado_fisico TEXT,
ADD COLUMN IF NOT EXISTS habitada TEXT;
