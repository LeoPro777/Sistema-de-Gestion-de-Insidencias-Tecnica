-- --- 1. FUNCIÓN Y TRIGGER: PREVENCIÓN DE BORRADO FÍSICO (SOFT-DELETES) ---
CREATE OR REPLACE FUNCTION fn_prevent_physical_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación prohibida: No se permite la eliminación física de registros en la tabla %. Utilice actualizaciones de estado para descartes lógicos (Soft-Delete).', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- Aplicar a las tablas del sistema operativo especificadas
CREATE TRIGGER trg_prevent_delete_areas
BEFORE DELETE ON areas_hospital
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_empleados
BEFORE DELETE ON empleados
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_usuarios
BEFORE DELETE ON usuarios
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_dispositivos
BEFORE DELETE ON dispositivos
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_pre_ordenes
BEFORE DELETE ON pre_ordenes
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_ordenes
BEFORE DELETE ON ordenes
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_inventario
BEFORE DELETE ON inventario_departamento
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_prestamos
BEFORE DELETE ON prestamos_herramientas
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();

CREATE TRIGGER trg_prevent_delete_traslados
BEFORE DELETE ON traslados
FOR EACH ROW EXECUTE FUNCTION fn_prevent_physical_delete();


-- --- 2. FUNCIÓN Y TRIGGER: DESCUENTO AUTOMÁTICO DE MATERIALES ---
CREATE OR REPLACE FUNCTION fn_descontar_stock_consumible()
RETURNS TRIGGER AS $$
BEGIN
    -- Intentar restar el stock. Si baja de cero, la restricción CHECK de inventario_departamento lanzará un error.
    UPDATE inventario_departamento
    SET stock = stock - NEW.cantidad
    WHERE id = NEW.consumible_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_descontar_stock_consumible
AFTER INSERT ON orden_consumibles
FOR EACH ROW EXECUTE FUNCTION fn_descontar_stock_consumible();


-- --- 3. FUNCIÓN AUXILIAR: CALCULO DE DIFERENCIAS JSONB ---
CREATE OR REPLACE FUNCTION jsonb_diff_val(val1 JSONB, val2 JSONB)
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}'::jsonb;
    key TEXT;
    v1 JSONB;
    v2 JSONB;
BEGIN
    FOR key IN SELECT jsonb_object_keys(val1) LOOP
        v1 := val1 -> key;
        v2 := val2 -> key;
        -- Si cambió el valor o ya no existe en el segundo objeto
        IF v1 <> v2 OR v2 IS NULL THEN
            result := jsonb_set(result, ARRAY[key], jsonb_build_object('old', v1, 'new', v2));
        END IF;
    END LOOP;
    -- Verificar claves que están en val2 pero no en val1
    FOR key IN SELECT jsonb_object_keys(val2) LOOP
        IF NOT val1 ? key THEN
            result := jsonb_set(result, ARRAY[key], jsonb_build_object('old', null, 'new', val2 -> key));
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;


-- --- 4. FUNCIÓN Y TRIGGER: AUDITORÍA MAESTRA INMUTABLE (DIFF LOG) ---
CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id INT;
    current_user_rol VARCHAR(50);
    old_json JSONB;
    new_json JSONB;
    diff_json JSONB;
    rec_id INT;
    action_name VARCHAR(100);
BEGIN
    -- Capturar variables de sesión de la transacción, previniendo fallas
    BEGIN
        current_user_id := NULLIF(current_setting('app.current_user_id', true), '')::INT;
    EXCEPTION WHEN OTHERS THEN
        current_user_id := NULL;
    END;
    
    BEGIN
        current_user_rol := COALESCE(NULLIF(current_setting('app.current_user_rol', true), ''), 'Sistema');
    EXCEPTION WHEN OTHERS THEN
        current_user_rol := 'Sistema';
    END;

    -- Obtener ID de registro según el esquema de la tabla
    IF TG_TABLE_NAME = 'empleados' THEN
        rec_id := CAST(COALESCE(NULLIF(regexp_replace(NEW.cedula, '[^0-9]', '', 'g'), ''), '0') AS INT);
    ELSIF TG_TABLE_NAME = 'orden_consumibles' THEN
        rec_id := NEW.orden_id;
    ELSE
        rec_id := NEW.id;
    END IF;

    -- Determinar operación e historial
    IF (TG_OP = 'INSERT') THEN
        new_json := to_jsonb(NEW);
        diff_json := jsonb_build_object('new', new_json);
        action_name := 'INSERT';
    ELSIF (TG_OP = 'UPDATE') THEN
        old_json := to_jsonb(OLD);
        new_json := to_jsonb(NEW);
        diff_json := jsonb_diff_val(old_json, new_json);
        action_name := 'UPDATE';
    END IF;

    -- Registrar solo si hay mutación real de campos
    IF TG_OP = 'INSERT' OR diff_json <> '{}'::jsonb THEN
        INSERT INTO auditoria_logs (usuario_id, rol_ejecutor, accion_ejecutada, tabla_afectada, registro_id, snapshot_cambio)
        VALUES (current_user_id, current_user_rol, action_name, TG_TABLE_NAME, rec_id, diff_json);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Registrar triggers de auditoría en tablas operacionales críticas
CREATE TRIGGER trg_audit_areas
AFTER INSERT OR UPDATE ON areas_hospital
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_empleados
AFTER INSERT OR UPDATE ON empleados
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_usuarios
AFTER INSERT OR UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_dispositivos
AFTER INSERT OR UPDATE ON dispositivos
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_pre_ordenes
AFTER INSERT OR UPDATE ON pre_ordenes
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_ordenes
AFTER INSERT OR UPDATE ON ordenes
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_inventario
AFTER INSERT OR UPDATE ON inventario_departamento
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_prestamos
AFTER INSERT OR UPDATE ON prestamos_herramientas
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_traslados
AFTER INSERT OR UPDATE ON traslados
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_config
AFTER INSERT OR UPDATE ON configuraciones_sistema
FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
