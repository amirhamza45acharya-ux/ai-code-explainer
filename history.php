<?php

session_start();

require_once __DIR__ . '/config/api.php';

if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit();
}

$user_id = $_SESSION["user_id"];

/*
|--------------------------------------------------------------------------
| Fetch History from MongoDB Atlas (via Backend API)
|--------------------------------------------------------------------------
*/
$apiResponse = callBackendApi('history?user_id=' . urlencode($user_id));

$explanations = [];
if (!empty($apiResponse["success"]) && is_array($apiResponse["explanations"])) {
    $explanations = $apiResponse["explanations"];
}

?>

<!DOCTYPE html>
<html>

<head>
    <title>Explanation History</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/style.css">
</head>

<body>

<div class="container">

    <h1>Explanation History</h1>

    <p>Your previous AI code explanations</p>

    <div class="history-actions">
        <a href="dashboard.php">
            <button type="button">← Back to Dashboard</button>
        </a>
    </div>

    <br>

    <?php if (empty($explanations)): ?>

        <div class="empty-history">
            <h3>No explanations yet</h3>
            <p>Your saved explanations will appear here.</p>
        </div>

    <?php else: ?>

        <?php foreach ($explanations as $row): ?>

            <div class="history-card">

                <div class="history-header">

                    <div>
                        <h2>
                            <?php echo htmlspecialchars($row["language"] ?? ""); ?>
                        </h2>

                        <p>
                            Explanation:
                            <?php echo htmlspecialchars($row["explanation_language"] ?? ""); ?>
                        </p>
                    </div>

                    <small>
                        <?php
                        $dateStr = $row["created_at"] ?? "";
                        if (!empty($dateStr)) {
                            $time = strtotime($dateStr);
                            echo htmlspecialchars($time ? date("Y-m-d H:i:s", $time) : $dateStr);
                        }
                        ?>
                    </small>

                </div>

                <h3>Your Code</h3>

                <pre class="code-block"><?php
                    echo htmlspecialchars($row["code"] ?? "");
                ?></pre>

                <h3>AI Explanation</h3>

                <div class="explanation">
                    <?php
                    echo nl2br(
                        htmlspecialchars($row["explanation"] ?? "")
                    );
                    ?>
                </div>

                <div class="history-footer">

                    <a href="delete_history.php?id=<?php echo urlencode($row["id"]); ?>" onclick="return confirm('Are you sure you want to delete this explanation?');">
                        <button type="button" class="delete-btn">
                            Delete
                        </button>
                    </a>

                </div>

            </div>

        <?php endforeach; ?>

    <?php endif; ?>

</div>

</body>
</html>