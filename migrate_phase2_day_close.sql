-- Day close / cashbook export tracking
CREATE TABLE IF NOT EXISTS day_closures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    close_date DATE NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'closed',
    closed_by_user_id INT NULL,
    closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reopened_by_user_id INT NULL,
    reopened_at DATETIME NULL,
    export_method VARCHAR(50) DEFAULT 'cashbook',
    export_batch_id VARCHAR(50) NULL,
    export_filename VARCHAR(255) NULL,
    auto_push TINYINT DEFAULT 0,
    INDEX idx_day_closures_date (close_date),
    CONSTRAINT fk_dayclose_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_dayclose_reopened_by FOREIGN KEY (reopened_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
