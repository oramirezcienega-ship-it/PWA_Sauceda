<?php
$host = 'mautic-db-prod';
$user = 'mautic';
$pass = 'mautic_db_pass';
$db   = 'mautic_prod';

$pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
]);

// 1. Despublicar campañas antiguas 1, 4, 5
$pdo->exec("UPDATE campaigns SET is_published = 0 WHERE id IN (1, 4, 5)");
echo "Campañas antiguas 1, 4, 5 despublicadas.\n";

$campanas = [
    [
        'name' => 'Impermeabilizacion - 1. Lead Inicial (Sin Precio)',
        'description' => 'Campaña automatizada para prospectos iniciales de impermeabilización (sin precio). Ofrece información técnica y agendar inspección.',
        'segment_id' => 1006,
        'action_name' => 'Enviar WhatsApp Lead Inicial',
        'url' => 'http://192.168.100.253:52900/webhook?campaign=reactivacion_impermeabilizacion_inicial&template=reactivacion_impermeabilizacio&language=es_MX',
    ],
    [
        'name' => 'Impermeabilizacion - 2. Contactado (Con Precio)',
        'description' => 'Campaña automatizada para prospectos que ya conocen paquetes/precios de impermeabilización. Empuja a agendar inspección técnica gratuita.',
        'segment_id' => 1007,
        'action_name' => 'Enviar WhatsApp Contactado Con Precio',
        'url' => 'http://192.168.100.253:52900/webhook?campaign=reactivacion_impermeabilizacion_contactado&template=reactivar_inspeccion_gratuita&language=en',
    ],
    [
        'name' => 'Impermeabilizacion - 3. Cotizacion y Levantamiento',
        'description' => 'Campaña automatizada de seguimiento para prospectos con levantamiento o cotización formal.',
        'segment_id' => 1000,
        'action_name' => 'Enviar WhatsApp Seguimiento Cotizacion',
        'url' => 'http://192.168.100.253:52900/webhook?campaign=seguimiento_cotizacion_impermeabilizacion&template=seguimiento_cotizacion_imper_v1&language=es_MX',
    ],
];

foreach ($campanas as $c) {
    $stmt = $pdo->prepare("SELECT id FROM campaigns WHERE name = ?");
    $stmt->execute([$c['name']]);
    $campId = $stmt->fetchColumn();

    $now = date('Y-m-d H:i:s');

    if ($campId) {
        $stmtUpd = $pdo->prepare("UPDATE campaigns SET is_published = 1, description = ?, date_modified = ? WHERE id = ?");
        $stmtUpd->execute([$c['description'], $now, $campId]);
        echo "Campaña existente actualizada: ID {$campId} ({$c['name']})\n";
    } else {
        $stmtIns = $pdo->prepare("INSERT INTO campaigns (is_published, date_added, name, description, allow_restart, version) VALUES (1, ?, ?, ?, 0, 1)");
        $stmtIns->execute([$now, $c['name'], $c['description']]);
        $campId = $pdo->lastInsertId();
        echo "Nueva campaña creada: ID {$campId} ({$c['name']})\n";
    }

    $pdo->prepare("DELETE FROM campaign_leadlist_xref WHERE campaign_id = ?")->execute([$campId]);
    $pdo->prepare("INSERT INTO campaign_leadlist_xref (campaign_id, leadlist_id) VALUES (?, ?)")->execute([$campId, $c['segment_id']]);
    echo "  -> Segmento {$c['segment_id']} vinculado a campaña {$campId}\n";

    $stmtEvent = $pdo->prepare("SELECT id FROM campaign_events WHERE campaign_id = ? AND type = 'campaign.sendwebhook'");
    $stmtEvent->execute([$campId]);
    $eventId = $stmtEvent->fetchColumn();

    $props = [
        'url' => $c['url'],
        'method' => 'post',
        'timeout' => 15,
        'headers' => [
            'list' => [
                ['label' => 'Content-Type', 'value' => 'application/json']
            ]
        ],
        'additional_data' => [
            'list' => [
                ['label' => 'lead_id', 'value' => '{contactfield=id}'],
                ['label' => 'firstname', 'value' => '{contactfield=firstname}'],
                ['label' => 'phone', 'value' => '{contactfield=phone}']
            ]
        ]
    ];
    $propsSerialized = serialize($props);

    if ($eventId) {
        $stmtEvUpd = $pdo->prepare("UPDATE campaign_events SET name = ?, properties = ?, trigger_mode = 'immediate', trigger_interval = 0, trigger_interval_unit = 'd' WHERE id = ?");
        $stmtEvUpd->execute([$c['action_name'], $propsSerialized, $eventId]);
        echo "  -> Evento existente actualizado: ID {$eventId}\n";
    } else {
        $stmtEvIns = $pdo->prepare("INSERT INTO campaign_events (campaign_id, name, type, event_type, event_order, properties, trigger_mode, trigger_interval, trigger_interval_unit, failed_count) VALUES (?, ?, 'campaign.sendwebhook', 'action', 1, ?, 'immediate', 0, 'd', 0)");
        $stmtEvIns->execute([$campId, $c['action_name'], $propsSerialized]);
        $eventId = $pdo->lastInsertId();
        echo "  -> Nuevo evento creado: ID {$eventId}\n";
    }

    $canvas = [
        'nodes' => [
            ['id' => 'lists', 'positionX' => '450', 'positionY' => '50'],
            ['id' => (string)$eventId, 'positionX' => '450', 'positionY' => '200'],
        ],
        'connections' => [
            [
                'sourceId' => 'lists',
                'targetId' => (string)$eventId,
                'anchors' => ['source' => 'leadsource', 'target' => 'top']
            ]
        ]
    ];
    $canvasSerialized = serialize($canvas);
    $pdo->prepare("UPDATE campaigns SET canvas_settings = ? WHERE id = ?")->execute([$canvasSerialized, $campId]);
    echo "  -> Canvas configurado para campaña {$campId}\n";
}
echo "¡Las 3 campañas han sido configuradas y publicadas con éxito!\n";
