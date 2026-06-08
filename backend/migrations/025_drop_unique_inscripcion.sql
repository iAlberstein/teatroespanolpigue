-- Drop unique indexes on (alumno_id, clase_id) to allow re-inscription after baja
ALTER TABLE newTEP.ateneo_inscripciones
    DROP INDEX uk_alumno_clase,
    DROP INDEX ateneo_inscripciones_alumno_id_clase_id;
