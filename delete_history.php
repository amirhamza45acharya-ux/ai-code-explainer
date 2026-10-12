<?php

session_start();

require_once __DIR__ . '/config/api.php';

if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit();
}

$user_id = $_SESSION["user_id"];
$id = $_GET["id"] ?? '';

if (!empty($id)) {
    // Delete from MongoDB Atlas via Backend API (with user authorization check)
    callBackendApi('history/' . urlencode($id), 'DELETE', [
        'user_id' => $user_id
    ]);
}

header("Location: history.php");
exit();

?>