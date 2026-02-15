<?php

namespace App\Services;

use App\Models\Entity;

class EntityFormatter
{
    public static function format(Entity $entity): string
    {
        $output = "";

        // Header
        $output .= "👤 {$entity->name}\n\n";

        // Type
        if ($entity->type) {
            $output .= "🏷 Type\n\n{$entity->type}\n\n";
        }

        // Role
        if (!empty($entity->attributes['role'])) {
            $output .= "🧠 Role\n\n{$entity->attributes['role']}\n\n";
        }

        // Organization
        if (!empty($entity->attributes['organization'])) {
            $output .= "🏢 Organization\n\n{$entity->attributes['organization']}\n\n";
        }

        // Meetings
        if (!empty($entity->events)) {
            $meetings = collect($entity->events)
                ->where('type', 'meeting');

            if ($meetings->count()) {
                $output .= "📅 Meetings\n\n";

                foreach ($meetings as $meeting) {
                    $output .= "{$meeting['datetime']} — {$meeting['description']}\n";
                }

                $output .= "\n";
            }
        }

        // Connections
        if (!empty($entity->relationships)) {
            $output .= "🤝 Connections\n\n";

            foreach ($entity->relationships as $rel) {
                $output .= ucfirst(str_replace('_', ' ', $rel['type']))
                    . " with {$rel['target']}";

                if (!empty($rel['target_role'])) {
                    $output .= " ({$rel['target_role']})";
                }

                $output .= "\n";
            }

            $output .= "\n";
        }

        // Responsibilities
        if (!empty($entity->responsibilities)) {
            $output .= "🧩 Responsibilities\n\n";

            foreach ($entity->responsibilities as $resp) {
                $output .= "• {$resp}\n";
            }

            $output .= "\n";
        }

        return trim($output);
    }
}
