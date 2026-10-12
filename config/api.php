<?php

// Prevent multiple inclusions
if (defined('AI_EXPLAINER_CONFIG_LOADED')) {
    return;
}
define('AI_EXPLAINER_CONFIG_LOADED', true);

/**
 * Simple .env parser for PHP
 */
function loadEnvFile($filePath) {
    if (!file_exists($filePath)) {
        return;
    }
    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if (empty($line) || strpos($line, '#') === 0) {
            continue;
        }
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            // Remove wrapping quotes if present
            $value = trim($value, "\"'");
            if (!isset($_ENV[$key])) {
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }
    }
}

// Load .env
$envPath = __DIR__ . '/../.env';
loadEnvFile($envPath);

// Configuration Constants
$apiBaseUrl = getenv('API_BASE_URL') ?: 'http://localhost:5000/api';
$googleClientId = getenv('GOOGLE_CLIENT_ID') ?: '';
$apiSecretKey = getenv('API_SECRET_KEY') ?: 'sec_ai_code_explainer_2026_x789';

/**
 * Call the Express / MongoDB Backend API via cURL
 */
function callBackendApi($endpoint, $method = 'GET', $data = null) {
    global $apiBaseUrl, $apiSecretKey;

    $url = rtrim($apiBaseUrl, '/') . '/' . ltrim($endpoint, '/');
    $ch = curl_init($url);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $headers = [
        'Content-Type: application/json',
        'x-api-secret: ' . $apiSecretKey
    ];

    if (strtoupper($method) === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    } elseif (strtoupper($method) === 'DELETE') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return [
            'success' => false,
            'message' => 'Unable to connect to backend server: ' . $curlError
        ];
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        return [
            'success' => false,
            'message' => 'Invalid response from backend server (HTTP ' . $httpCode . ')'
        ];
    }

    return $decoded;
}

